import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const db = getDb();
  const dealId = req.nextUrl.searchParams.get('deal_id');
  if (!dealId) return NextResponse.json([]);
  const diligence = db.prepare('SELECT * FROM diligence WHERE deal_id = ? ORDER BY id').all(dealId);
  const items = db.prepare(`
    SELECT di.* FROM diligence_items di
    JOIN diligence d ON di.diligence_id = d.id
    WHERE d.deal_id = ?
  `).all(dealId);
  return NextResponse.json({ diligence, items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO diligence (deal_id, category, vendor, due_date)
    VALUES (@deal_id, @category, @vendor, @due_date)
  `).run(body);
  return NextResponse.json({ id: result.lastInsertRowid });
}
