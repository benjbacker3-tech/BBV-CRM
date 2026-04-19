import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  return NextResponse.json(db.prepare('SELECT * FROM investors ORDER BY name').all());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO investors (name, type, commitment, called, status, notes)
    VALUES (@name, @type, @commitment, @called, @status, @notes)
  `).run(body);
  return NextResponse.json({ id: result.lastInsertRowid });
}
