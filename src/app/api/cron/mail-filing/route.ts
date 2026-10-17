import { NextRequest, NextResponse } from 'next/server';
import { graphConfigured, graphErrorMessage } from '@/lib/graph';
import { recheckMail, scanMail } from '@/lib/mail-filing';
import { scanLeads } from '@/lib/leads';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily Vercel cron (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
// Files email attachments, then looks for broker leads (lib/leads.ts) in the same run.
// If a manual "Check email now" is running, the scan reports busy and this run skips.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!graphConfigured()) return NextResponse.json({ skipped: 'Microsoft 365 not connected' });
  try {
    const scan = await scanMail(28_000);
    const recheck = scan.more ? null : await recheckMail(8_000);
    const leads = await scanLeads(14_000).catch(e => ({ error: graphErrorMessage(e) }));
    return NextResponse.json({ scan, recheck, leads });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
