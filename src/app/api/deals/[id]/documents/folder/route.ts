import { NextRequest, NextResponse } from 'next/server';
import { get } from '@/lib/db';
import { Deal } from '@/lib/utils';
import { graphConfigured, graphErrorMessage } from '@/lib/graph';
import { createDealFolder, findDealFolder } from '@/lib/deal-docs';

export const dynamic = 'force-dynamic';

// POST → create Acquisitions/<Address, City, ST>/ with the standard subfolders
// (returns the existing folder if the deal already has one).
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected yet.' }, { status: 503 });
  const deal = await get<Deal>('SELECT * FROM deals WHERE id = ?', [params.id]);
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  try {
    const existing = await findDealFolder(deal);
    if (existing) return NextResponse.json({ folder: existing, created: false });
    return NextResponse.json({ folder: await createDealFolder(deal), created: true });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
