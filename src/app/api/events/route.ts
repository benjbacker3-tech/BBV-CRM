import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';

export async function GET() {
  // Sort upcoming first, then past
  const events = await all(`
    SELECT * FROM events
    ORDER BY
      CASE WHEN COALESCE(end_date, start_date) >= date('now') THEN 0 ELSE 1 END,
      start_date ASC
  `);
  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const result = await run(
    `INSERT INTO events (name, category, start_date, end_date, location, url, cost, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [b.name, b.category || null, b.start_date || null, b.end_date || null, b.location || null, b.url || null, b.cost || null, b.notes || null]
  );
  return NextResponse.json({ id: result.lastInsertRowid });
}
