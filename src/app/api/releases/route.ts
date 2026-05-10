import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';

export async function GET() {
  // Most recent / upcoming releases first
  const releases = await all(`
    SELECT * FROM economic_releases
    ORDER BY release_date DESC, id DESC
  `);
  return NextResponse.json(releases);
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const result = await run(
    `INSERT INTO economic_releases
       (name, release_date, release_time, previous_value, consensus, actual_value, interpretation, importance, url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      b.name, b.release_date,
      b.release_time || null, b.previous_value || null,
      b.consensus || null, b.actual_value || null,
      b.interpretation || null, b.importance || 'medium', b.url || null,
    ]
  );
  return NextResponse.json({ id: result.lastInsertRowid });
}
