import { NextRequest, NextResponse } from 'next/server';
import { all, get, run } from '@/lib/db';
import { addTx, notFound, propertyBySlug } from '@/lib/personal-server';
import { Checkin, currentMonth, newId, todayIso } from '@/lib/personal';

// A month's check-in: rent received, mortgage paid, notes, month complete. Ticking rent or
// mortgage also writes (or removes) the matching ledger entry, as the old app did.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const month = req.nextUrl.searchParams.get('month') || currentMonth();
  const checkin = await get<Checkin>('SELECT * FROM personal_checkins WHERE property_id = ? AND month = ?', [p.id, month]);
  const utilities = await all('SELECT * FROM personal_utility_bills WHERE property_id = ? AND month = ?', [p.id, month]);
  return NextResponse.json({ property: p, month, checkin: checkin ?? null, utilities });
}

async function ensureRow(propertyId: string, month: string) {
  await run('INSERT OR IGNORE INTO personal_checkins (id, property_id, month) VALUES (?, ?, ?)', [newId(), propertyId, month]);
  return (await get<Checkin>('SELECT * FROM personal_checkins WHERE property_id = ? AND month = ?', [propertyId, month]))!;
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const { month, action, date, notes } = (await req.json()) as { month: string; action: string; date?: string; notes?: string };
  if (!/^\d{4}-\d{2}$/.test(month || '')) return NextResponse.json({ error: 'Bad month' }, { status: 400 });
  const row = await ensureRow(p.id, month);
  const day = date || todayIso();

  if (action === 'rent') {
    const next = !row.rent_received;
    await run('UPDATE personal_checkins SET rent_received = ?, rent_received_date = ?, rent_amount = ? WHERE property_id = ? AND month = ?',
      [next ? 1 : 0, next ? day : null, next ? p.tenant_rent : null, p.id, month]);
    if (next) await addTx(p.id, { date: day, description: `Rent - ${p.tenant_name}`, category: 'Rent', type: 'Income', amount: p.tenant_rent, source: 'checkin' });
    else await run("DELETE FROM personal_transactions WHERE property_id = ? AND category = 'Rent' AND source = 'checkin' AND date = ?", [p.id, row.rent_received_date]);
  } else if (action === 'mortgage') {
    const next = !row.mortgage_paid;
    await run('UPDATE personal_checkins SET mortgage_paid = ?, mortgage_paid_date = ? WHERE property_id = ? AND month = ?',
      [next ? 1 : 0, next ? day : null, p.id, month]);
    if (next) await addTx(p.id, { date: day, description: `${p.loan_servicer} Mortgage Payment`, category: 'Mortgage', type: 'Expense', amount: p.loan_payment, source: 'checkin' });
    else await run("DELETE FROM personal_transactions WHERE property_id = ? AND category = 'Mortgage' AND source = 'checkin' AND date = ?", [p.id, row.mortgage_paid_date]);
  } else if (action === 'notes') {
    await run('UPDATE personal_checkins SET notes = ? WHERE property_id = ? AND month = ?', [notes || null, p.id, month]);
  } else if (action === 'complete') {
    await run('UPDATE personal_checkins SET completed_at = ? WHERE property_id = ? AND month = ?', [row.completed_at ? null : new Date().toISOString(), p.id, month]);
  } else {
    return NextResponse.json({ error: 'Bad action' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
