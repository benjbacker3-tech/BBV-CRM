import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function GET() {
  const deals = await all('SELECT * FROM deals ORDER BY created_at DESC');
  return NextResponse.json(deals);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await run(
    `INSERT INTO deals (
       name, address, city, market, submarket,
       sf, acreage, occupancy,
       asking_price, yoc_initial, yoc_target, equity_required,
       zoning, ios_eligible, stage, source,
       dd_expiry, dd_days, close_date, close_days, deposit, notes
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      body.name,
      body.address ?? null,
      body.city ?? null,
      body.market ?? null,
      body.submarket ?? null,
      body.sf ?? 0,
      body.acreage ?? 0,
      body.occupancy ?? 0,
      body.asking_price ?? 0,
      body.yoc_initial ?? 0,
      body.yoc_target ?? 0,
      body.equity_required ?? 0,
      body.zoning ?? null,
      body.ios_eligible ?? 1,
      body.stage ?? 'Tracking',
      body.source ?? null,
      body.dd_expiry || null,
      body.dd_days ?? 0,
      body.close_date || null,
      body.close_days ?? 0,
      body.deposit ?? 0,
      body.notes ?? null,
    ]
  );
  await logActivity({ entity_type: 'deal', entity_id: result.lastInsertRowid, action: 'created', description: `Deal "${body.name}" created` });
  return NextResponse.json({ id: result.lastInsertRowid });
}
