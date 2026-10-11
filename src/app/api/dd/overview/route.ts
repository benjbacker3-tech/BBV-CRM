import { NextRequest, NextResponse } from 'next/server';
import { all } from '@/lib/db';
import { DdItem } from '@/lib/dd-template';
import { ensureChecklist, checklistItems, dealCosts } from '@/lib/dd-server';

// GET ?closed=1 → every deal in diligence, with its checklist and costs, for the
// cross-deal grid and the dashboard. "In diligence" = Under Contract, plus a
// Negotiating PSA deal whose checklist has already been started (diligence can
// begin before the PSA is signed). ?closed=1 adds Closed deals.
// Also returns every started construction checklist (any stage) as `construction`.
export async function GET(req: NextRequest) {
  const closed = !!req.nextUrl.searchParams.get('closed');
  const deals = await all<{ id: number; name: string; address: string; city: string; state: string | null; stage: string; dd_expiry: string | null; close_date: string | null }>(
    `SELECT id, name, address, city, state, stage, dd_expiry, close_date FROM deals
     WHERE stage = 'Under Contract'
        OR (stage = 'Negotiating PSA' AND EXISTS (SELECT 1 FROM dd_items i WHERE i.deal_id = deals.id AND i.list = 'dd'))
        ${closed ? "OR stage = 'Closed'" : ''}
     ORDER BY CASE stage WHEN 'Closed' THEN 2 WHEN 'Under Contract' THEN 0 ELSE 1 END,
              COALESCE(close_date, dd_expiry, '9999'), name`,
  );
  const ids = deals.map(d => d.id);
  await ensureChecklist(deals.filter(d => d.stage !== 'Negotiating PSA').map(d => d.id));
  const [items, costs, construction] = await Promise.all([
    checklistItems(ids),
    dealCosts(ids),
    all<DdItem>("SELECT * FROM dd_items WHERE list = 'cm' ORDER BY deal_id, sort, id"),
  ]);
  return NextResponse.json({ deals, items, costs, construction });
}
