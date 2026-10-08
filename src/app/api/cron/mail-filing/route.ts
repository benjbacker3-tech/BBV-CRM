import { NextRequest, NextResponse } from 'next/server';
import { graphConfigured, graphErrorMessage } from '@/lib/graph';
import { recheckMail, scanMail } from '@/lib/mail-filing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Daily Vercel cron (vercel.json). Vercel sends "Authorization: Bearer <CRON_SECRET>".
// If a manual "Check email now" is running, the scan reports busy and this run skips.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!graphConfigured()) return NextResponse.json({ skipped: 'Microsoft 365 not connected' });
  try {
    const scan = await scanMail(35_000);
    const recheck = scan.more ? null : await recheckMail(10_000);
    return NextResponse.json({ scan, recheck });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
