import { NextRequest, NextResponse } from 'next/server';
import { all } from '@/lib/db';
import { Deal } from '@/lib/utils';
import { graphConfigured } from '@/lib/graph';
import { DocsContext, SyncResult, syncDealModel } from '@/lib/deal-docs';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST /api/models/sync[?force=1] — refresh returns and fees from every live deal's
// newest model. Model files that haven't changed since the last sync are skipped
// unless force=1.
export async function POST(req: NextRequest) {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected yet.' }, { status: 503 });
  const force = req.nextUrl.searchParams.get('force') === '1';
  const deals = await all<Deal>("SELECT * FROM deals WHERE stage != 'Dead' ORDER BY id");
  const ctx = new DocsContext();
  const results: { id: number; deal: string; result: SyncResult }[] = [];
  for (let i = 0; i < deals.length; i += 4) {
    const batch = deals.slice(i, i + 4);
    results.push(...(await Promise.all(batch.map(async d => ({ id: d.id, deal: d.address || d.name, result: await syncDealModel(d, ctx, force) })))));
  }
  const count = (...s: SyncResult['status'][]) => results.filter(r => s.includes(r.result.status)).length;
  return NextResponse.json({
    updated: count('updated'),
    unchanged: count('unchanged'),
    noModel: count('no_model'),
    problems: count('error', 'no_outputs'),
    results,
  });
}
