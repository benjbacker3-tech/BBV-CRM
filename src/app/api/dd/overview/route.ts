import { NextRequest, NextResponse } from 'next/server';
import { all } from '@/lib/db';
import { ensureChecklist, checklistItems, dealCosts } from '@/lib/dd-server';

// GET ?closed=1 → every Under Contract deal (plus Closed when asked) with its checklist
// and costs, for the cross-deal grid.
export async function GET(req: NextRequest) {
  const stages = req.nextUrl.searchParams.get('closed') ? ['Under Contract', 'Closed'] : ['Under Contract'];
  const deals = await all<{ id: number; name: string; address: string; city: string; state: string | null; stage: string; dd_expiry: string | null; close_date: string | null }>(
    `SELECT id, name, address, city, state, stage, dd_expiry, close_date FROM deals
     WHERE stage IN (${stages.map(() => '?').join(',')}) ORDER BY stage DESC, COALESCE(close_date, dd_expiry, '9999'), name`,
    stages,
  );
  const ids = deals.map(d => d.id);
  await ensureChecklist(ids);
  const [items, costs] = await Promise.all([checklistItems(ids), dealCosts(ids)]);
  return NextResponse.json({ deals, items, costs });
}
