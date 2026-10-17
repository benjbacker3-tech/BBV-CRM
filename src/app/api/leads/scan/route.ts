import { NextResponse } from 'next/server';
import { graphConfigured, graphErrorMessage } from '@/lib/graph';
import { scanLeads } from '@/lib/leads';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// "Check email now" on the Leads tab.
export async function POST() {
  if (!graphConfigured()) return NextResponse.json({ error: 'Microsoft 365 is not connected' }, { status: 400 });
  try {
    return NextResponse.json(await scanLeads(45_000));
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
