import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { graphErrorMessage, itemById } from '@/lib/graph';
import { EmailFile, RULES_VERSION, fileFromReview } from '@/lib/mail-filing';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET: open the filed document. Looked up by item id, since the saved link stops working
// once the file is renamed or moved in OneDrive.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const rec = await get<EmailFile>('SELECT * FROM email_files WHERE id = ?', [Number(params.id)]);
  if (!rec?.drive_item_id) return NextResponse.json({ error: 'Not filed' }, { status: 404 });
  const item = await itemById(rec.drive_item_id).catch(() => null);
  const url = item?.webUrl || rec.drive_web_url;
  if (!url) return NextResponse.json({ error: 'File not found in OneDrive' }, { status: 404 });
  if (item?.webUrl && item.webUrl !== rec.drive_web_url) await run('UPDATE email_files SET drive_web_url = ? WHERE id = ?', [item.webUrl, rec.id]);
  return NextResponse.redirect(url);
}

// POST { action: 'file', dealId, folder } | { action: 'dismiss' } | { action: 'review' }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => ({}));
  const id = Number(params.id);
  if (body.action === 'dismiss' || body.action === 'review') {
    const rec = await get<EmailFile>('SELECT * FROM email_files WHERE id = ?', [id]);
    if (!rec) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    // Moved back to review by hand: stamped with the current rules so a recheck leaves it there.
    await run('UPDATE email_files SET status = ?, rules_version = ? WHERE id = ?', [body.action === 'dismiss' ? 'dismissed' : 'review', RULES_VERSION, id]);
    // Dismissing also dismisses the same attachment forwarded on other emails: same name,
    // same size or thread, suggested for the same deal (or none).
    if (body.action === 'dismiss') {
      await run(
        `UPDATE email_files SET status = 'dismissed' WHERE status = 'review' AND id != ? AND lower(file_name) = lower(?)
         AND (size = ? OR conversation_id = ?) AND deal_id IS ?`,
        [id, rec.file_name, rec.size, rec.conversation_id, rec.deal_id]);
    }
    return NextResponse.json({ ok: true });
  }
  if (body.action !== 'file') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  try {
    const dealId = body.dealId ? Number(body.dealId) : null;
    const rec = await fileFromReview(id, dealId, String(body.folder ?? ''));
    if (dealId) await logActivity({ entity_type: 'deal', entity_id: dealId, action: 'email_filed', description: `Filed ${rec.file_name} from email to ${rec.folder || 'the deal folder'}` });
    return NextResponse.json({ row: rec });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
