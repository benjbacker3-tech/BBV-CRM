import { NextRequest, NextResponse } from 'next/server';
import { all } from '@/lib/db';
import { notFound, propertyBySlug } from '@/lib/personal-server';
import { saveTaxYear, taxYear } from '@/lib/personal-audit';

export const dynamic = 'force-dynamic';

const yearOf = (v: unknown) => (typeof v === 'string' && /^\d{4}$/.test(v) ? v : String(new Date().getFullYear()));

// GET ?year= → the Schedule E view, cash flow, the document checklist and the year's ledger.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const year = yearOf(req.nextUrl.searchParams.get('year'));
  const [summary, tx, years] = await Promise.all([
    taxYear(p, year),
    all('SELECT * FROM personal_transactions WHERE property_id = ? AND substr(date, 1, 4) = ? ORDER BY date DESC', [p.id, year]),
    all<{ y: string }>('SELECT DISTINCT substr(date, 1, 4) AS y FROM personal_transactions WHERE property_id = ? ORDER BY y DESC', [p.id]),
  ]);
  const allYears = Array.from(new Set([String(new Date().getFullYear()), ...years.map(r => String(r.y))])).sort().reverse();
  return NextResponse.json({ property: p, summary, tx, years: allYears });
}

// PATCH { year, mortgage_interest } or { year, doc, done, note }.
export async function PATCH(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const b = await req.json();
  const patch: Parameters<typeof saveTaxYear>[2] = {};
  if ('mortgage_interest' in b) {
    const v = b.mortgage_interest === '' || b.mortgage_interest == null ? null : Number(b.mortgage_interest);
    patch.mortgage_interest = v != null && isFinite(v) && v >= 0 ? v : null;
  }
  if (typeof b.doc === 'string') Object.assign(patch, { doc: b.doc, done: !!b.done, note: typeof b.note === 'string' ? b.note.slice(0, 300) : undefined });
  await saveTaxYear(p.id, yearOf(b.year), patch);
  return NextResponse.json({ ok: true });
}
