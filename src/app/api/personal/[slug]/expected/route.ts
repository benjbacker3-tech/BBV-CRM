import { NextRequest, NextResponse } from 'next/server';
import { run } from '@/lib/db';
import { notFound, propertyBySlug } from '@/lib/personal-server';
import { loadExpected } from '@/lib/personal-audit';
import { LEDGER_CATEGORIES, NOTE_CATEGORY, newId } from '@/lib/personal';

// The property's expected monthly lines (rent in, mortgage out, ...), edited on the Property tab.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  return NextResponse.json({ expected: await loadExpected(p.id) });
}

const month = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v) ? v : null);
function clean(b: Record<string, unknown>, slug: string) {
  const category = String(b.category || '');
  if (!(LEDGER_CATEGORIES as readonly string[]).includes(category) && !(category === NOTE_CATEGORY && slug === 'emerson')) return null;
  const amount = b.amount === '' || b.amount == null ? null : Number(b.amount);
  return {
    label: String(b.label || '').trim().slice(0, 120) || category,
    type: b.type === 'Income' ? 'Income' : 'Expense',
    category,
    amount: amount != null && isFinite(amount) && amount > 0 ? amount : null,
    every_months: Math.max(1, Math.min(12, Number(b.every_months) || 1)),
    start_month: month(b.start_month), end_month: month(b.end_month),
    match: String(b.match || '').toLowerCase().slice(0, 200) || null,
  };
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const c = clean(await req.json(), p.slug);
  if (!c) return NextResponse.json({ error: 'Pick a category' }, { status: 400 });
  await run('INSERT INTO personal_expected (id, property_id, label, type, category, amount, every_months, start_month, end_month, match, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 99)',
    [newId(), p.id, c.label, c.type, c.category, c.amount, c.every_months, c.start_month, c.end_month, c.match]);
  return NextResponse.json({ expected: await loadExpected(p.id) });
}

export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const b = await req.json();
  const c = clean(b, p.slug);
  if (!c) return NextResponse.json({ error: 'Pick a category' }, { status: 400 });
  await run('UPDATE personal_expected SET label = ?, type = ?, category = ?, amount = ?, every_months = ?, start_month = ?, end_month = ?, match = ? WHERE id = ? AND property_id = ?',
    [c.label, c.type, c.category, c.amount, c.every_months, c.start_month, c.end_month, c.match, String(b.id), p.id]);
  return NextResponse.json({ expected: await loadExpected(p.id) });
}

export async function DELETE(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  await run('DELETE FROM personal_expected WHERE id = ? AND property_id = ?', [req.nextUrl.searchParams.get('id'), p.id]);
  return NextResponse.json({ expected: await loadExpected(p.id) });
}
