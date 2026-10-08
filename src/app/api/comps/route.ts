import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';
import { COMP_FIELDS, MARKET_STATE } from '@/lib/comps';
import { cleanCompInput } from '@/lib/comps-server';

export const dynamic = 'force-dynamic';

// GET /api/comps?review=approved|pending|all (default approved)
export async function GET(req: NextRequest) {
  const review = req.nextUrl.searchParams.get('review') || 'approved';
  const where = review === 'all' ? "review_status != 'rejected'" : 'review_status = ?';
  const rows = await all(
    `SELECT * FROM comps WHERE ${where}
     ORDER BY market, kind, (comp_date IS NULL), comp_date DESC, (available_date IS NULL), available_date DESC, id DESC`,
    review === 'all' ? [] : [review]
  );
  return NextResponse.json(rows);
}

// POST /api/comps — manual entry. Lands approved unless the caller says otherwise.
export async function POST(req: NextRequest) {
  const data = cleanCompInput(await req.json());
  if (!data.address || !data.kind) {
    return NextResponse.json({ error: 'address and kind are required' }, { status: 400 });
  }
  data.review_status ??= 'approved';
  data.source ??= 'manual';
  if (!data.state && data.market) data.state = MARKET_STATE[String(data.market)] ?? null;
  const keys = COMP_FIELDS.filter(k => data[k] !== undefined);
  const result = await run(
    `INSERT INTO comps (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map(k => data[k] as string | number | null)
  );
  return NextResponse.json({ id: result.lastInsertRowid });
}
