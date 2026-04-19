import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  const db = getDb();
  const settings = db.prepare('SELECT * FROM openphone_settings WHERE id = 1').get();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const fields = Object.keys(body).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE openphone_settings SET ${fields} WHERE id = 1`).run(body);
  const updated = db.prepare('SELECT * FROM openphone_settings WHERE id = 1').get();
  return NextResponse.json(updated);
}
