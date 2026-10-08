// Share links for vendors and consultants, served by the CRM (not OneDrive sharing),
// so each link can carry a password, an expiry, upload access and an access log.
// Public pages live at /s/<token>; their API at /api/share/<token>/…

import crypto from 'crypto';
import { promisify } from 'util';
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

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;
async function checkPassword(pw: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(':');
  const got = await scrypt(pw, salt, 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const secret = () => process.env.AUTH_SECRET || 'dev-only-secret-set-AUTH_SECRET-in-vercel';
export const unlockCookie = (s: Share) => `sp_share_${s.id}`;
// Tied to the current password, so changing or removing it signs everyone out.
const unlockValue = (s: Share) => crypto.createHmac('sha256', secret()).update(`${s.token}|${s.password_hash}`).digest('hex');

export type ShareState = { ok: true; share: Share } | { ok: false; status: number; error: string; needsPassword?: boolean; name?: string };

// A link that exists and is neither revoked nor expired (password not checked).
export async function liveShare(token: string): Promise<{ ok: true; share: Share } | { ok: false; status: number; error: string }> {
  const share = await get<Share>('SELECT * FROM shares WHERE token = ?', [token]);
  if (!share || share.revoked_at) return { ok: false, status: 404, error: 'This link is no longer active.' };
  if (share.expires_at && new Date(share.expires_at).getTime() < Date.now()) return { ok: false, status: 410, error: 'This link has expired.' };
  return { ok: true, share };
}

const sameText = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Resolve a token for a public request: exists, not revoked or expired, unlocked.
export async function openShare(req: NextRequest, token: string): Promise<ShareState> {
  const st = await liveShare(token);
  if (!st.ok) return st;
  const share = st.share;
  if (share.password_hash && !sameText(req.cookies.get(unlockCookie(share))?.value || '', unlockValue(share))) {
    // No item name before the password: it is usually the property address.
    return { ok: false, status: 401, error: 'Password required', needsPassword: true, name: 'Shared files' };
  }
  return { ok: true, share };
}

// Each attempt is recorded before the password is checked (and removed when it was right),
// so parallel guesses all count. Limits: 10 an hour from one address, 30 an hour in all.
export async function unlock(share: Share, password: string, ip: string | null): Promise<{ ok: boolean; cookie?: { name: string; value: string }; error?: string }> {
  if (!share.password_hash) return { ok: true, cookie: { name: unlockCookie(share), value: unlockValue(share) } };
  const { lastInsertRowid } = await run("INSERT INTO share_events (share_id, kind, detail, ip) VALUES (?, 'bad_password', NULL, ?)", [share.id, ip]);
  const recent = await get<{ total: number; mine: number }>(
    "SELECT COUNT(*) AS total, SUM(CASE WHEN ip IS ? THEN 1 ELSE 0 END) AS mine FROM share_events WHERE share_id = ? AND kind = 'bad_password' AND created_at > datetime('now', '-1 hour')",
    [ip, share.id]);
  if (Number(recent?.mine) > 10 || Number(recent?.total) > 30) return { ok: false, error: 'Too many attempts. Try again in an hour.' };
  if (await checkPassword(password, share.password_hash)) {
    await run('DELETE FROM share_events WHERE id = ?', [lastInsertRowid]);
    return { ok: true, cookie: { name: unlockCookie(share), value: unlockValue(share) } };
  }
  return { ok: false, error: 'Wrong password.' };
}

export const clientIp = (req: NextRequest) => (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

export async function logEvent(share: Share, kind: 'open' | 'download' | 'upload' | 'upload_start', detail: string | null, ip: string | null) {
  await run('INSERT INTO share_events (share_id, kind, detail, ip) VALUES (?, ?, ?, ?)', [share.id, kind, detail, ip]);
  if (kind !== 'upload_start') await run("UPDATE shares SET last_access_at = datetime('now') WHERE id = ?", [share.id]);
}

// Count recent events of one kind for a link (optionally only from one address).
export async function recentEvents(share: Share, kind: string, sinceSql: string, ip?: string | null): Promise<number> {
  const r = await get<{ n: number }>(
    `SELECT COUNT(*) AS n FROM share_events WHERE share_id = ? AND kind = ? AND created_at > datetime('now', ?)${ip !== undefined ? ' AND ip IS ?' : ''}`,
    ip !== undefined ? [share.id, kind, sinceSql, ip] : [share.id, kind, sinceSql]);
  return Number(r?.n) || 0;
}

// Public errors stay generic; the details go to the server log.
export function publicError(e: unknown, where: string): string {
  console.error(`[share ${where}]`, e);
  return 'OneDrive is not responding right now. Try again in a few minutes.';
}

// Is `itemId` the shared item or inside it? Walks up the parent chain (ids survive
// renames and moves, unlike paths).
// `trail` (optional) receives the folders walked through, nearest first, ending just
// below the shared folder, so callers can build a breadcrumb without walking again.
export async function itemInShare(share: Share, itemId: string, trail?: DriveItem[]): Promise<DriveItem | null> {
  const item = await itemById(itemId);
  if (!item) return null;
  if (item.id === share.item_id) return item;
  if (!share.is_folder) return null;
  let parentId = item.parentReference?.id;
  for (let depth = 0; parentId && depth < 12; depth++) {
    if (parentId === share.item_id) return item;
    const parent = await itemById(parentId);
    if (parent) trail?.push(parent);
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
