import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const db = getDb();
  const fields = Object.keys(body).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE diligence SET ${fields} WHERE id = @id`).run({ ...body, id: params.id });
  return NextResponse.json({ ok: true });
}
