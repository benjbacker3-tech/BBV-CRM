// Share links for vendors and consultants, served by the CRM (not OneDrive sharing),
// so each link can carry a password, an expiry, upload access and an access log.
// Public pages live at /s/<token>; their API at /api/share/<token>/…

import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { get, run } from './db';
import { DriveItem, itemById, sendMailToOwner } from './graph';

export interface Share {
  id: number;
  token: string;
  mode: 'view' | 'upload' | 'both';
  item_id: string;
  item_name: string;
  item_path: string | null;
  is_folder: number;
  deal_id: number | null;
  recipient: string;
  recipient_email: string | null;
  password_hash: string | null;
  expires_at: string | null;
  notify: number;
  revoked_at: string | null;
  last_access_at: string | null;
  created_at: string;
}

export const canView = (s: Share) => s.mode === 'view' || s.mode === 'both';
export const canUpload = (s: Share) => s.is_folder === 1 && (s.mode === 'upload' || s.mode === 'both');

export const newToken = () => crypto.randomBytes(18).toString('base64url');

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}

function checkPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  const got = crypto.scryptSync(pw, salt, 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const secret = () => process.env.AUTH_SECRET || 'dev-only-secret-set-AUTH_SECRET-in-vercel';
export const unlockCookie = (s: Share) => `sp_share_${s.id}`;
// Tied to the current password, so changing or removing it signs everyone out.
const unlockValue = (s: Share) => crypto.createHmac('sha256', secret()).update(`${s.token}|${s.password_hash}`).digest('hex');

export type ShareState = { ok: true; share: Share } | { ok: false; status: number; error: string; needsPassword?: boolean; name?: string };

// Resolve a token for a public request: exists, not revoked or expired, unlocked.
export async function openShare(req: NextRequest, token: string): Promise<ShareState> {
  const share = await get<Share>('SELECT * FROM shares WHERE token = ?', [token]);
  if (!share || share.revoked_at) return { ok: false, status: 404, error: 'This link is no longer active.' };
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) return { ok: false, status: 410, error: 'This link has expired.' };
  if (share.password_hash && req.cookies.get(unlockCookie(share))?.value !== unlockValue(share)) {
    return { ok: false, status: 401, error: 'Password required', needsPassword: true, name: share.item_name };
  }
  return { ok: true, share };
}

export async function unlock(share: Share, password: string, ip: string | null):Promise<{ ok: boolean; cookie?: { name: string; value: string }; error?: string }> {
  const recent = await get<{ n: number }>("SELECT COUNT(*) AS n FROM share_events WHERE share_id = ? AND kind = 'bad_password' AND created_at > datetime('now', '-1 hour')", [share.id]);
  if (Number(recent?.n) >= 10) return { ok: false, error: 'Too many attempts. Try again in an hour.' };
  if (!share.password_hash || checkPassword(password, share.password_hash)) {
    return { ok: true, cookie: { name: unlockCookie(share), value: unlockValue(share) } };
  }
  await logEvent(share, 'bad_password', null, ip);
  return { ok: false, error: 'Wrong password.' };
}

export const clientIp = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

export async function logEvent(share: Share, kind: 'open' | 'download' | 'upload' | 'bad_password', detail: string | null, ip: string | null) {
  await run('INSERT INTO share_events (share_id, kind, detail, ip) VALUES (?, ?, ?, ?)', [share.id, kind, detail, ip]);
  if (kind !== 'bad_password') await run("UPDATE shares SET last_access_at = datetime('now') WHERE id = ?", [share.id]);
}

// Is `itemId` the shared item or inside it? Walks up the parent chain (ids survive
// renames and moves, unlike paths).
export async function itemInShare(share: Share, itemId: string): Promise<DriveItem | null> {
  const item = await itemById(itemId);
  if (!item) return null;
  if (item.id === share.item_id) return item;
  if (!share.is_folder) return null;
  let parentId = item.parentReference?.id;
  for (let depth = 0; parentId && depth < 12; depth++) {
    if (parentId === share.item_id) return item;
    const parent = await itemById(parentId);
    parentId = parent?.parentReference?.id;
  }
  return null;
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// Email Ben about link activity. Opens are sent at most once per link per 12 hours;
// uploads every time. Failures (e.g. no Mail.Send permission) are ignored.
export async function notifyActivity(share: Share, kind: 'open' | 'upload', lines: string[], origin: string) {
  if (!share.notify) return;
  if (kind === 'open') {
    const prior = await get<{ n: number }>("SELECT COUNT(*) AS n FROM share_events WHERE share_id = ? AND kind = 'open' AND created_at > datetime('now', '-12 hours')", [share.id]);
    if (Number(prior?.n) > 1) return; // the open just logged is the first in 12h
  }
  const what = kind === 'open' ? 'opened' : `uploaded ${lines.length} file${lines.length === 1 ? '' : 's'} to`;
  const subject = `${share.recipient} ${what} ${share.item_name}`;
  const html = `<p style="font-family:Arial,sans-serif;font-size:14px">${esc(share.recipient)} ${what} <b>${esc(share.item_path || share.item_name)}</b>.</p>`
    + (lines.length ? `<ul style="font-family:Arial,sans-serif;font-size:13px">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>` : '')
    + `<p style="font-family:Arial,sans-serif;font-size:12px;color:#666"><a href="${origin}/documents/shares">Shared links in the CRM</a></p>`;
  await sendMailToOwner(subject, html).catch(e => console.error('[shares] notify', e));
}
