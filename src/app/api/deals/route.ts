import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function GET() {
  const db = getDb();
  const deals = db.prepare('SELECT * FROM deals ORDER BY created_at DESC').all();
  return NextResponse.json(deals);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO deals (name, address, market, submarket, acreage, asking_price, yoc_target, zoning, ios_eligible, stage, source, dd_expiry, notes)
    VALUES (@name, @address, @market, @submarket, @acreage, @asking_price, @yoc_target, @zoning, @ios_eligible, @stage, @source, @dd_expiry, @notes)
  `).run(body);
  logActivity(db, { entity_type: 'deal', entity_id: Number(result.lastInsertRowid), action: 'created', description: `Deal "${body.name}" created` });
  return NextResponse.json({ id: result.lastInsertRowid });
}
