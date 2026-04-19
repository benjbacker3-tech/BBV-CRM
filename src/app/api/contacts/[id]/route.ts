import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const contact = await get('SELECT * FROM contacts WHERE id = ?', [params.id]);
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const keys = Object.keys(body);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => body[k]);
  await run(`UPDATE contacts SET ${setClause} WHERE id = ?`, [...values, params.id]);
  const contact = await get('SELECT * FROM contacts WHERE id = ?', [params.id]);
  return NextResponse.json(contact);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run('DELETE FROM contacts WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
