import { NextRequest, NextResponse } from 'next/server';
import { all } from '@/lib/db';
import { notFound, propertyBySlug } from '@/lib/personal-server';
import { auditYear, closeMonth, confirmExpected, loadExpected, reopenMonth, setMonthNotes, skipExpected, unskipExpected, utilitiesOwed } from '@/lib/personal-audit';

export const dynamic = 'force-dynamic';

// GET ?year=YYYY → the year's 12 months (status, expected lines, statement lines), the expected
// lines, recent statement imports, and what the tenant owes for utilities.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const y = req.nextUrl.searchParams.get('year') || '';
  const year = /^\d{4}$/.test(y) ? y : String(new Date().getFullYear());
  const [months, expected, imports, owed] = await Promise.all([
    auditYear(p, year), loadExpected(p.id),
    all('SELECT * FROM personal_statement_imports WHERE property_id = ? ORDER BY imported_at DESC LIMIT 6', [p.id]),
    utilitiesOwed(p.id),
  ]);
  return NextResponse.json({ property: p, year, months, expected, imports, owed });
}

// POST { action, month, ... }:
//   close | reopen | notes {notes} | confirm {expected_id, date, amount} | skip {expected_id, note} | unskip {expected_id}
//   close-ready {year}: close every past month with nothing left to resolve.
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const b = await req.json();
  const month = typeof b.month === 'string' && /^\d{4}-\d{2}$/.test(b.month) ? b.month : null;
  try {
    switch (b.action) {
      case 'close': if (month) await closeMonth(p.id, month); break;
      case 'reopen': if (month) await reopenMonth(p.id, month); break;
      case 'notes': if (month) await setMonthNotes(p.id, month, String(b.notes ?? '')); break;
      case 'confirm':
        if (!month || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !(Number(b.amount) > 0)) return NextResponse.json({ error: 'Date and amount are required' }, { status: 400 });
        await confirmExpected(p, String(b.expected_id), b.date, Number(b.amount));
        break;
      case 'skip': if (month) await skipExpected(p.id, month, String(b.expected_id), b.note ? String(b.note) : null); break;
      case 'unskip': if (month) await unskipExpected(p.id, month, String(b.expected_id)); break;
      case 'close-ready': {
        const months = await auditYear(p, String(b.year));
        const ready = months.filter(m => m.state === 'ready');
        for (const m of ready) await closeMonth(p.id, m.month);
        return NextResponse.json({ closed: ready.length });
      }
      default: return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
