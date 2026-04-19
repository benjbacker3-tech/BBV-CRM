import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const snapshot = db.prepare('SELECT * FROM market_snapshots ORDER BY snapshot_date DESC LIMIT 1').get() as { id: number; snapshot_date: string; data: string } | undefined;
  if (!snapshot) return NextResponse.json(null);
  return NextResponse.json({ ...snapshot, data: JSON.parse(snapshot.data) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const result = db.prepare('INSERT INTO market_snapshots (snapshot_date, data) VALUES (@snapshot_date, @data)').run({
    snapshot_date: body.snapshot_date || new Date().toISOString().split('T')[0],
    data: JSON.stringify(body.data),
  });
  return NextResponse.json({ id: result.lastInsertRowid });
}
