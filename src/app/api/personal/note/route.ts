import { NextRequest, NextResponse } from 'next/server';
import { all } from '@/lib/db';
import { logNotePayment } from '@/lib/personal-audit';
import { NOTE, NotePayment, noteSchedule, round2 } from '@/lib/personal';

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

// Logs a payment (interest on the running balance, the rest to principal; the interest also
// goes to Emerson's ledger as income). Same path as a statement line filed as Dan's note.
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.date || '')) return NextResponse.json({ error: 'Date is required' }, { status: 400 });
  await logNotePayment(body.date, Number(body.amount) || NOTE.monthly);
  return NextResponse.json({ ok: true }, { status: 201 });
}
