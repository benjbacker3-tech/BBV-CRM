import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';
import { addTx, notFound, propertyBySlug } from '@/lib/personal-server';
import { UTILITY_LABEL, UtilityType, currentMonth, newId, round2, shiftMonth } from '@/lib/personal';

// Utility bills paid and recharged to the tenant: the shown month plus six before it, and the
// running balance the tenant owes across all history.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const month = req.nextUrl.searchParams.get('month') || currentMonth();
  const months = [month, ...Array.from({ length: 6 }, (_, i) => shiftMonth(month, -(i + 1)))];
  const bills = await all(`SELECT * FROM personal_utility_bills WHERE property_id = ? AND month IN (${months.map(() => '?').join(',')})`, [p.id, ...months]);
  const [owed] = await all<{ owed: number | null }>('SELECT SUM(COALESCE(amount_paid, 0) - COALESCE(amount_recharged, 0)) AS owed FROM personal_utility_bills WHERE property_id = ?', [p.id]);
  return NextResponse.json({ property: p, month, bills, balanceOwed: round2(owed?.owed ?? 0) });
}

const num = (v: unknown) => (typeof v === 'number' && isFinite(v) ? v : null);
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

// Saves one month's bill and rewrites its ledger entries (paid = expense, recharged = income).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const b = await req.json();
  const type = b.utility_type as UtilityType;
  if (!UTILITY_LABEL[type] || !/^\d{4}-\d{2}$/.test(b.month || '')) return NextResponse.json({ error: 'Bad bill' }, { status: 400 });
  const paid = num(b.amount_paid), datePaid = day(b.date_paid), re = num(b.amount_recharged), dateRe = day(b.date_recharged);
  await run(
    `INSERT INTO personal_utility_bills (id, property_id, month, utility_type, amount_paid, date_paid, amount_recharged, date_recharged, recharge_method, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(property_id, month, utility_type) DO UPDATE SET amount_paid = excluded.amount_paid, date_paid = excluded.date_paid,
       amount_recharged = excluded.amount_recharged, date_recharged = excluded.date_recharged, recharge_method = excluded.recharge_method, notes = excluded.notes`,
    [newId(), p.id, b.month, type, paid, datePaid, re, dateRe, re != null ? 'venmo' : null, b.notes || null],
  );
  const source = `utility:${b.month}:${type}`;
  const label = UTILITY_LABEL[type];
  await run('DELETE FROM personal_transactions WHERE property_id = ? AND source = ?', [p.id, source]);
  if (paid != null && datePaid) await addTx(p.id, { date: datePaid, description: `${label} bill`, category: label, type: 'Expense', amount: paid, source });
  if (re != null && dateRe) await addTx(p.id, { date: dateRe, description: `${label} recharge from ${p.tenant_name}`, category: label, type: 'Income', amount: re, source });
  return NextResponse.json({ ok: true });
}
