import { NextRequest, NextResponse } from 'next/server';
import { all, get, run } from '@/lib/db';
import { addTx } from '@/lib/personal-server';
import { NOTE, NotePayment, newId, noteSchedule, round2 } from '@/lib/personal';

// Dan's note on Emerson: payments logged so far, the balance, and the full schedule.
export async function GET() {
  const payments = await all<NotePayment>('SELECT * FROM personal_note_payments ORDER BY date');
  const last = payments[payments.length - 1];
  return NextResponse.json({
    stats: {
      original: NOTE.principal, rate: NOTE.rate, monthly: NOTE.monthly, term: NOTE.termMonths,
      balance: round2(last ? last.balance_after : NOTE.principal),
      paidCount: payments.length,
      interestEarned: round2(payments.reduce((s, p) => s + p.interest, 0)),
    },
    payments,
    schedule: noteSchedule(),
  });
}

// Logs a payment: interest on the running balance, the rest to principal. The interest is
// also written to Emerson's ledger as income.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  const last = await get<NotePayment>('SELECT * FROM personal_note_payments ORDER BY date DESC LIMIT 1');
  const balance = last ? last.balance_after : NOTE.principal;
  const amount = Number(body.amount) || NOTE.monthly;
  const interest = balance * (NOTE.rate / 12);
  const principal = amount - interest;
  await run('INSERT INTO personal_note_payments (id, date, amount, principal, interest, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [newId(), body.date, amount, round2(principal), round2(interest), round2(Math.max(0, balance - principal)), new Date().toISOString()]);
  const emerson = await get<{ id: string }>("SELECT id FROM personal_properties WHERE slug = 'emerson'");
  if (emerson) {
    await addTx(emerson.id, {
      date: body.date, description: 'Dan Equity Loan - Interest', category: 'Dan payback', type: 'Income', amount: interest, source: 'dan-payment',
      notes: `Interest of $${amount.toFixed(2)} payment. Principal: $${principal.toFixed(2)}`,
    });
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
