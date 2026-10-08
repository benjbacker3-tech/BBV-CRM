import { NextRequest, NextResponse } from 'next/server';
import { all, get, run } from '@/lib/db';
import { Deal } from '@/lib/utils';
import { ROOT_PATH, graphConfigured, graphErrorMessage, itemById } from '@/lib/graph';
import { Share, hashPassword, newToken } from '@/lib/shares';
import { sameAddress } from '@/lib/model-parse';

export const dynamic = 'force-dynamic';

type Row = Share & { has_password: number; deal_name: string | null; opens: number; downloads: number; uploads: number };

// GET ?dealId= → share links (newest first) with access counts. The token is returned
// so the link can be copied again; password hashes never leave the server.
export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get('dealId');
  const rows = await all<Row>(
    `SELECT s.*, (s.password_hash IS NOT NULL) AS has_password, COALESCE(d.address, d.name) AS deal_name,
       (SELECT COUNT(*) FROM share_events e WHERE e.share_id = s.id AND e.kind = 'open') AS opens,
       (SELECT COUNT(*) FROM share_events e WHERE e.share_id = s.id AND e.kind = 'download') AS downloads,
       (SELECT COUNT(*) FROM share_events e WHERE e.share_id = s.id AND e.kind = 'upload') AS uploads
     FROM shares s LEFT JOIN deals d ON d.id = s.deal_id
     ${dealId ? 'WHERE s.deal_id = ?' : ''} ORDER BY s.created_at DESC LIMIT 500`, dealId ? [dealId] : []);
  return NextResponse.json({ shares: rows.map(r => ({ ...r, password_hash: undefined })) });
}

// POST { itemId, mode, recipient, recipientEmail?, password?, expiresDays?, notify?, dealId? }
export async function POST(req: NextRequest) {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected yet.' }, { status: 503 });
  const b = await req.json();
  const mode = ['view', 'upload', 'both'].includes(b.mode) ? b.mode : 'view';
  const recipient = String(b.recipient || '').trim();
  if (!b.itemId || !recipient) return NextResponse.json({ error: 'Pick a file or folder and say who it is for.' }, { status: 400 });
  try {
    const item = await itemById(String(b.itemId));
    if (!item) return NextResponse.json({ error: 'File or folder not found' }, { status: 404 });
    if (mode !== 'view' && !item.folder) return NextResponse.json({ error: 'Upload links need a folder.' }, { status: 400 });
    // Only things inside the Sandpiper folder can be shared (never the whole OneDrive).
    const fullParent = decodeURIComponent(item.parentReference?.path?.split('root:')[1] ?? '');
    if (!(fullParent === `/${ROOT_PATH}` || fullParent.startsWith(`/${ROOT_PATH}/`))) {
      return NextResponse.json({ error: `Only files and folders inside ${ROOT_PATH} can be shared.` }, { status: 400 });
    }
    // "/drive/root:/Sandpiper/Acquisitions/…" → "Acquisitions/…/<name>"
    const parent = fullParent.replace(new RegExp(`^/?${ROOT_PATH}/?`), '');
    const itemPath = [parent, item.name].filter(Boolean).join('/');
    let dealId: number | null = b.dealId ? Number(b.dealId) : null;
    if (!dealId) {
      const deals = await all<Deal>('SELECT * FROM deals');
      const segs = itemPath.split('/');
      dealId = deals.find(d => segs.some(s => sameAddress(s, d.address || d.name)))?.id ?? null;
    }
    const days = Number(b.expiresDays);
    const expires = days > 0 ? new Date(Date.now() + days * 86400_000).toISOString() : null;
    const { lastInsertRowid } = await run(
      `INSERT INTO shares (token, mode, item_id, item_name, item_path, is_folder, deal_id, recipient, recipient_email, password_hash, expires_at, notify)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [newToken(), mode, item.id, item.name, itemPath, item.folder ? 1 : 0, dealId, recipient, b.recipientEmail ? String(b.recipientEmail).trim() : null,
        b.password ? hashPassword(String(b.password)) : null, expires, b.notify === false ? 0 : 1]);
    const share = await get<Share>('SELECT * FROM shares WHERE id = ?', [lastInsertRowid]);
    return NextResponse.json({ share: { ...share, password_hash: undefined, has_password: share?.password_hash ? 1 : 0 } });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
