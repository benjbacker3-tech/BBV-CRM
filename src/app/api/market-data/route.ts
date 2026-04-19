import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';

export async function GET() {
  const snapshot = await get<{ id: number; snapshot_date: string; data: string }>(
    'SELECT * FROM market_snapshots ORDER BY snapshot_date DESC LIMIT 1'
  );
  if (!snapshot) return NextResponse.json(null);
  return NextResponse.json({ ...snapshot, data: JSON.parse(snapshot.data) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await run(
    'INSERT INTO market_snapshots (snapshot_date, data) VALUES (?, ?)',
    [body.snapshot_date || new Date().toISOString().split('T')[0], JSON.stringify(body.data)]
  );
  return NextResponse.json({ id: result.lastInsertRowid });
}
