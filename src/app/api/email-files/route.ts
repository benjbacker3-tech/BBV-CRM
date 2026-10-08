import { NextRequest, NextResponse } from 'next/server';
import { all, get, run } from '@/lib/db';
import { grantedRoles, graphConfigured, graphErrorMessage } from '@/lib/graph';
import { EmailFile, FOLDER_STAGES, scanMail } from '@/lib/mail-filing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET ?status=review|filed|skipped|dismissed → rows (newest first), counts, last run,
// and the deals that can receive files.
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'review';
  const rows = await all<EmailFile & { deal_name: string | null }>(
    `SELECT e.*, COALESCE(d.address, d.name) AS deal_name FROM email_files e LEFT JOIN deals d ON d.id = e.deal_id
     WHERE e.status = ? ORDER BY e.received_at DESC LIMIT 300`, [status]);
  const counts = Object.fromEntries((await all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM email_files GROUP BY status')).map(r => [r.status, Number(r.n)]));
  const last = await get<{ value: string }>("SELECT value FROM app_state WHERE key = 'mail_filing_last_run'");
  const deals = await all<{ id: number; label: string; stage: string }>(
    `SELECT id, COALESCE(address, name) AS label, stage FROM deals WHERE stage IN (${FOLDER_STAGES.map(() => '?').join(',')}) ORDER BY label`, FOLDER_STAGES);
  let mailAccess: boolean | null = null;
  if (graphConfigured()) mailAccess = await grantedRoles().then(r => r.some(x => /^Mail\.(Read|ReadWrite)$/.test(x))).catch(() => null);
  return NextResponse.json({ rows, counts, lastRun: last ? JSON.parse(last.value) : null, deals, mailAccess, configured: graphConfigured() });
}

// POST { action: 'scan' } → scan new email now. { action: 'dismiss_all' } → clear the review list.
export async function POST(req: NextRequest) {
  const { action } = await req.json();
  if (action === 'dismiss_all') {
    const r = await run("UPDATE email_files SET status = 'dismissed' WHERE status = 'review'");
    return NextResponse.json({ dismissed: r.rowsAffected });
  }
  if (action !== 'scan') return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  if (!graphConfigured()) return NextResponse.json({ error: 'Microsoft 365 is not connected yet.' }, { status: 503 });
  try {
    return NextResponse.json(await scanMail(45_000));
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
