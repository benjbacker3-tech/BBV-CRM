import { NextRequest, NextResponse } from 'next/server';
import { run } from '@/lib/db';
import { graphErrorMessage } from '@/lib/graph';
import { fileFromReview } from '@/lib/mail-filing';
import { logActivity } from '@/lib/activity';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { action: 'file', dealId, folder } | { action: 'dismiss' } | { action: 'review' }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const id = Number(params.id);
  if (body.action === 'dismiss' || body.action === 'review') {
    await run('UPDATE email_files SET status = ? WHERE id = ?', [body.action === 'dismiss' ? 'dismissed' : 'review', id]);
    // Dismissing also dismisses the same attachment forwarded on other emails.
    if (body.action === 'dismiss') await run("UPDATE email_files SET status = 'dismissed' WHERE status = 'review' AND lower(file_name) = (SELECT lower(file_name) FROM email_files WHERE id = ?)", [id]);
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
