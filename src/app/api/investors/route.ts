import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';

export async function GET() {
  return NextResponse.json(await all('SELECT * FROM investors ORDER BY name'));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await run(
    `INSERT INTO investors (name, type, commitment, called, status, notes) VALUES (?, ?, ?, ?, ?, ?)`,
    [body.name, body.type ?? null, body.commitment ?? 0, body.called ?? 0, body.status ?? null, body.notes ?? null]
  );
  return NextResponse.json({ id: result.lastInsertRowid });
}
