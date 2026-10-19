import { NextRequest, NextResponse } from 'next/server';
import { all, get, run } from '@/lib/db';
import { notFound, propertyBySlug } from '@/lib/personal-server';
import { LEDGER_CATEGORIES, newId, round2 } from '@/lib/personal';

// Income and expenses for one year (default: this year), plus the years that have entries.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const year = req.nextUrl.searchParams.get('year') || String(new Date().getFullYear());
  const tx = await all('SELECT * FROM personal_transactions WHERE property_id = ? AND substr(date, 1, 4) = ? ORDER BY date DESC', [p.id, year]);
  const years = (await all<{ y: string }>('SELECT DISTINCT substr(date, 1, 4) AS y FROM personal_transactions WHERE property_id = ? ORDER BY y DESC', [p.id])).map(r => r.y);
  return NextResponse.json({ year, years, tx });
}

const isCategory = (c: unknown): c is string => typeof c === 'string' && ((LEDGER_CATEGORIES as readonly string[]).includes(c) || c === 'Dan payback');

// POST { date, description, category, type, amount, notes } → an entry added by hand
// (something that didn't go through the bank account, e.g. a repair Ben paid personally).
export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const b = await req.json();
  const amount = Math.abs(Number(b.amount));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !isCategory(b.category) || !(amount > 0)) return NextResponse.json({ error: 'Date, category and amount are required' }, { status: 400 });
  await run('INSERT INTO personal_transactions (id, property_id, date, description, category, type, amount, source, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), p.id, b.date, String(b.description || b.category).slice(0, 200), b.category, b.type === 'Income' ? 'Income' : 'Expense', round2(amount), 'manual', b.notes ? String(b.notes).slice(0, 500) : null]);
  return NextResponse.json({ ok: true }, { status: 201 });
}

// PATCH { id, category } → re-file an entry (also updates the statement line it came from).
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const b = await req.json();
  if (!isCategory(b.category)) return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
  await run('UPDATE personal_transactions SET category = ? WHERE id = ? AND property_id = ?', [b.category, String(b.id), p.id]);
  await run('UPDATE personal_statement_lines SET category = ? WHERE tx_id = ? AND property_id = ?', [b.category, String(b.id), p.id]);
  return NextResponse.json({ ok: true });
}

// DELETE ?id= → only entries added by hand; bank-statement and imported entries stay.
export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const id = req.nextUrl.searchParams.get('id');
  const t = await get<{ source: string | null }>('SELECT source FROM personal_transactions WHERE id = ? AND property_id = ?', [id, p.id]);
  if (!t) return notFound();
  if (t.source !== 'manual') return NextResponse.json({ error: 'Only entries added by hand can be deleted' }, { status: 400 });
  await run('DELETE FROM personal_transactions WHERE id = ?', [id]);
  return NextResponse.json({ ok: true });
}
