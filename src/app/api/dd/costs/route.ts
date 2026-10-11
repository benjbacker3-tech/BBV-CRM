import { NextRequest, NextResponse } from 'next/server';
import { run } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { COST_STATUSES } from '@/lib/dd-template';
import { fmt } from '@/lib/utils';

const num = (v: unknown) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

// POST { deal_id, category, vendor?, proposal_amount?, invoice_amount?, status?, paid_date?, notes? }
export async function POST(req: NextRequest) {
  const b = await req.json();
  const dealId = Number(b.deal_id);
  const category = str(b.category);
  if (!dealId || !category) return NextResponse.json({ error: 'deal_id and category required' }, { status: 400 });
  const status = b.status ?? 'proposal';
  if (!COST_STATUSES.includes(status)) return NextResponse.json({ error: 'Bad status' }, { status: 400 });
  const res = await run(
    `INSERT INTO dd_costs (deal_id, category, vendor, proposal_amount, invoice_amount, status, paid_date, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [dealId, category, str(b.vendor), num(b.proposal_amount), num(b.invoice_amount), status, str(b.paid_date), str(b.notes)],
  );
  await logActivity({
    entity_type: 'diligence', entity_id: dealId, action: 'cost_added',
    description: `${category}${b.vendor ? ` (${str(b.vendor)})` : ''} ${status} ${fmt(num(b.invoice_amount) ?? num(b.proposal_amount))}`,
  });
  return NextResponse.json({ id: res.lastInsertRowid });
}
