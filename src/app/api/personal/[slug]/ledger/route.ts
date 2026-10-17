import { NextRequest, NextResponse } from 'next/server';
import { all } from '@/lib/db';
import { notFound, propertyBySlug } from '@/lib/personal-server';

// Income and expenses for one year (default: this year), plus the years that have entries.
export async function GET(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const year = req.nextUrl.searchParams.get('year') || String(new Date().getFullYear());
  const tx = await all('SELECT * FROM personal_transactions WHERE property_id = ? AND substr(date, 1, 4) = ? ORDER BY date DESC', [p.id, year]);
  const years = (await all<{ y: string }>('SELECT DISTINCT substr(date, 1, 4) AS y FROM personal_transactions WHERE property_id = ? ORDER BY y DESC', [p.id])).map(r => r.y);
  return NextResponse.json({ year, years, tx });
}
