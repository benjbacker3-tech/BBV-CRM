import { NextRequest, NextResponse } from 'next/server';
import { all, get } from '@/lib/db';
import { Lead } from '@/lib/leads';

// Leads by status (default: new), newest first, with counts and the last scan.
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get('status') || 'new';
  const leads = await all<Lead & { match_name: string | null; match_stage: string | null }>(
    `SELECT l.*, d.name AS match_name, d.stage AS match_stage FROM leads l LEFT JOIN deals d ON d.id = COALESCE(l.deal_id, l.match_deal_id)
     WHERE l.status = ? ORDER BY l.received_at DESC LIMIT 300`, [status]);
  const counts = Object.fromEntries((await all<{ status: string; n: number }>('SELECT status, COUNT(*) AS n FROM leads GROUP BY status')).map(r => [r.status, Number(r.n)]));
  const last = await get<{ value: string }>("SELECT value FROM app_state WHERE key = 'leads_last_run'");
  return NextResponse.json({ leads, counts, lastRun: last ? JSON.parse(last.value) : null });
}
