import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(params.id);
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const db = getDb();
  const fields = Object.keys(body).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE contacts SET ${fields} WHERE id = @id`).run({ ...body, id: params.id });
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(params.id);
  return NextResponse.json(contact);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  db.prepare('DELETE FROM contacts WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}
