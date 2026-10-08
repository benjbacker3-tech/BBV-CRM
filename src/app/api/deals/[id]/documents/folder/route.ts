import { NextRequest, NextResponse } from 'next/server';
import { get } from '@/lib/db';
import { Deal } from '@/lib/utils';
import { graphConfigured, graphErrorMessage } from '@/lib/graph';
import { findDealFolder } from '@/lib/deal-docs';
import { organizeDeal } from '@/lib/cleanup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const FOLDER_STAGES = ['Negotiating PSA', 'Under Contract', 'Closed'];

// POST → create the deal's folder (stage-appropriate location, 8 standard subfolders)
// and move its models / LOIs in from Prelim Models and LOIs.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected yet.' }, { status: 503 });
  const deal = await get<Deal>('SELECT * FROM deals WHERE id = ?', [params.id]);
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  if (!FOLDER_STAGES.includes(deal.stage)) {
    return NextResponse.json({ error: 'Deal folders are created once the LOI is accepted (Negotiating PSA or later).' }, { status: 400 });
  }
  try {
    const before = await findDealFolder(deal);
    const results = await organizeDeal(deal.id);
    const folder = await findDealFolder(deal);
    if (!folder) return NextResponse.json({ error: results.find(r => !r.ok)?.error || 'Folder was not created' }, { status: 502 });
    return NextResponse.json({ folder, created: !before, moved: results.filter(r => r.ok && r.id.startsWith('move:')).length, failed: results.filter(r => !r.ok).length });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
