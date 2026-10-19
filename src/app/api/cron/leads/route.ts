import { NextRequest, NextResponse } from 'next/server';
import { graphConfigured, graphErrorMessage } from '@/lib/graph';
import { scanLeads } from '@/lib/leads';
import { recordJob } from '@/lib/job-health';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily Vercel cron (vercel.json): look for broker leads in new email (lib/leads.ts).
// Vercel sends "Authorization: Bearer <CRON_SECRET>".
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!graphConfigured()) return NextResponse.json({ skipped: 'Microsoft 365 not connected' });
  try {
    return NextResponse.json(await recordJob('leads', () => scanLeads(50_000), r => (r.busy ? 'skipped: a manual scan was running' : `${r.added} new of ${r.checked} checked${r.errors.length ? `, ${r.errors.length} errors` : ''}`)));
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
