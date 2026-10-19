import { NextRequest, NextResponse } from 'next/server';
import { get, run, updateFromBody } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const contact = await get('SELECT * FROM contacts WHERE id = ?', [params.id]);
  if (!contact) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(contact);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  await updateFromBody('contacts', body, 'id = ?', [params.id]);
  const contact = await get('SELECT * FROM contacts WHERE id = ?', [params.id]);
  return NextResponse.json(contact);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run('DELETE FROM contacts WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
