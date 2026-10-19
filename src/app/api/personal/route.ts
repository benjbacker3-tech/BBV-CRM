import { NextResponse } from 'next/server';
import { all } from '@/lib/db';
import { PersonalProperty, currentMonth, round2 } from '@/lib/personal';
import { auditYear, taxYear, utilitiesOwed } from '@/lib/personal-audit';

export const dynamic = 'force-dynamic';

// The personal properties for the Assets page: audit progress this year, year-to-date numbers,
// utilities the tenant owes, and the next key date.
export async function GET() {
  const year = currentMonth().slice(0, 4);
  const props = await all<PersonalProperty>('SELECT * FROM personal_properties ORDER BY slug');
  const out = [];
  for (const p of props) {
    const [months, tax, owed, next] = await Promise.all([
      auditYear(p, year), taxYear(p, year), utilitiesOwed(p.id),
      all<{ name: string; due_date: string }>('SELECT name, due_date FROM personal_reminders WHERE property_id = ? AND dismissed = 0 ORDER BY due_date LIMIT 1', [p.id]),
    ]);
    const closed = months.filter(m => m.state === 'closed').map(m => m.month);
    out.push({
      ...p,
      audit: {
        lastClosed: closed[closed.length - 1] ?? null,
        needsLook: months.filter(m => m.state === 'issues').length,
        ready: months.filter(m => m.state === 'ready').length,
      },
      ytd: { net: tax.net, cash: tax.cash.net, rents: tax.rents },
      utilitiesOwed: round2(owed.reduce((s, o) => s + Math.max(0, o.owed), 0)),
      nextReminder: next[0] ?? null,
    });
  }
  return NextResponse.json(out);
}
