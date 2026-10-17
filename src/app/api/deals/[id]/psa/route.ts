import { NextRequest, NextResponse } from 'next/server';
import { get } from '@/lib/db';
import { Deal } from '@/lib/utils';
import { graphConfigured, graphErrorMessage } from '@/lib/graph';
import { readDealPsa } from '@/lib/contract-server';

export const maxDuration = 60;

// Finds the deal's PSA in OneDrive and suggests its key terms (each with the sentence it came
// from). Nothing is saved; the Contract dates card applies what Ben accepts.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const deal = await get<Deal>('SELECT * FROM deals WHERE id = ?', [params.id]);
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected' }, { status: 400 });
  try {
    return NextResponse.json(await readDealPsa(deal));
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
