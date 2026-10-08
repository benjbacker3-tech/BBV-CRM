import { NextRequest, NextResponse } from 'next/server';
import { get } from '@/lib/db';
import { Deal } from '@/lib/utils';
import { graphConfigured, graphErrorMessage, itemById } from '@/lib/graph';
import { DocsContext, findDealFolder, folderTree, relatedFiles } from '@/lib/deal-docs';

export const dynamic = 'force-dynamic';

// The deal's OneDrive folder (two levels deep), related files elsewhere, and its synced model.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!graphConfigured()) return NextResponse.json({ configured: false });
  const deal = await get<Deal>('SELECT * FROM deals WHERE id = ?', [params.id]);
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  try {
    const ctx = new DocsContext();
    const [folder, related] = await Promise.all([findDealFolder(deal, ctx), relatedFiles(deal, ctx)]);
    const [tree, model] = await Promise.all([
      folder ? folderTree(folder.id, 2) : Promise.resolve([]),
      deal.model_item_id ? itemById(deal.model_item_id) : Promise.resolve(null),
    ]);
    return NextResponse.json({ configured: true, folder, tree, related, model, modelSyncedAt: deal.model_synced_at });
  } catch (e) {
    return NextResponse.json({ configured: true, error: graphErrorMessage(e) }, { status: 502 });
  }
}
