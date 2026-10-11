import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { COST_STATUSES, COST_STATUS_LABEL, CostStatus } from '@/lib/dd-template';

const NUMERIC = ['proposal_amount', 'invoice_amount'];
const FIELDS = ['category', 'vendor', 'proposal_amount', 'invoice_amount', 'status', 'paid_date', 'notes'] as const;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const keys = FIELDS.filter(k => k in body);
  if (!keys.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  if ('status' in body && !COST_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Bad status' }, { status: 400 });
  }
  const before = await get<{ deal_id: number; category: string; vendor: string | null; status: CostStatus; paid_date: string | null }>(
    'SELECT deal_id, category, vendor, status, paid_date FROM dd_costs WHERE id = ?', [params.id],
  );
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const values = keys.map(k => {
    const v = body[k];
    if (NUMERIC.includes(k)) return v === '' || v == null || isNaN(Number(v)) ? null : Number(v);
    return typeof v === 'string' ? (v.trim() || null) : v;
  });
  const sets = keys.map(k => `${k} = ?`);
  // Marking paid stamps today's date unless one was given.
  if (body.status === 'paid' && !('paid_date' in body) && !before.paid_date) sets.push("paid_date = date('now')");
  await run(`UPDATE dd_costs SET ${sets.join(', ')} WHERE id = ?`, [...values, params.id]);
  if (body.status && body.status !== before.status) {
    await logActivity({
      entity_type: 'diligence', entity_id: before.deal_id, action: 'cost_status',
      description: `${before.category}${before.vendor ? ` (${before.vendor})` : ''} marked ${COST_STATUS_LABEL[body.status as CostStatus]}`,
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run('DELETE FROM dd_costs WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
