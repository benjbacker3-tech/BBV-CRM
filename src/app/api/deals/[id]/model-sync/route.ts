import { NextRequest, NextResponse } from 'next/server';
import { get } from '@/lib/db';
import { Deal } from '@/lib/utils';
import { graphConfigured } from '@/lib/graph';
import { syncDealModel } from '@/lib/deal-docs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST → re-read this deal's newest model and update its returns and fees.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected yet.' }, { status: 503 });
  const deal = await get<Deal>('SELECT * FROM deals WHERE id = ?', [params.id]);
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  const result = await syncDealModel(deal, undefined, true);
  return NextResponse.json({ result, deal: await get<Deal>('SELECT * FROM deals WHERE id = ?', [params.id]) });
}
