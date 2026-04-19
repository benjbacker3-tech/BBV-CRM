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
    `INSERT INTO deals (name, address, market, submarket, acreage, asking_price, yoc_target, zoning, ios_eligible, stage, source, dd_expiry, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [body.name, body.address ?? null, body.market ?? null, body.submarket ?? null, body.acreage ?? 0, body.asking_price ?? 0, body.yoc_target ?? 0, body.zoning ?? null, body.ios_eligible ?? 1, body.stage ?? 'Tracking', body.source ?? null, body.dd_expiry || null, body.notes ?? null]
  );
  await logActivity({ entity_type: 'deal', entity_id: result.lastInsertRowid, action: 'created', description: `Deal "${body.name}" created` });
  return NextResponse.json({ id: result.lastInsertRowid });
}
