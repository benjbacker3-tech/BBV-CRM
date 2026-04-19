import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';

export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get('deal_id');
  if (!dealId) return NextResponse.json({ diligence: [], items: [] });
  const diligence = await all('SELECT * FROM diligence WHERE deal_id = ? ORDER BY id', [dealId]);
  const items = await all(
    `SELECT di.* FROM diligence_items di JOIN diligence d ON di.diligence_id = d.id WHERE d.deal_id = ?`,
    [dealId]
  );
  return NextResponse.json({ diligence, items });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await run(
    `INSERT INTO diligence (deal_id, category, vendor, due_date) VALUES (?, ?, ?, ?)`,
    [body.deal_id, body.category, body.vendor ?? null, body.due_date ?? null]
  );
  return NextResponse.json({ id: result.lastInsertRowid });
}
