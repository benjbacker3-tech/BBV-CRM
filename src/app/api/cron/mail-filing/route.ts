import { NextRequest, NextResponse } from 'next/server';
import { graphConfigured, graphErrorMessage } from '@/lib/graph';
import { recheckMail, scanMail } from '@/lib/mail-filing';
import { recordJob } from '@/lib/job-health';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily Vercel cron (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
// Files email attachments, then re-runs the rules on anything left for review. Broker leads
// run on their own cron (/api/cron/leads) so each job gets the full time limit.
// If a manual "Check email now" is running, the scan reports busy and this run skips.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!graphConfigured()) return NextResponse.json({ skipped: 'Microsoft 365 not connected' });
  try {
    return NextResponse.json(await recordJob('mail-filing', async () => {
      const scan = await scanMail(40_000);
      const recheck = scan.more ? null : await recheckMail(12_000);
      return { scan, recheck };
    }, r => (r.scan.more ? 'more mail waiting for the next run' : 'caught up')));
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
