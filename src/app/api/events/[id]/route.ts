import { NextRequest, NextResponse } from 'next/server';
import { run } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const keys = Object.keys(body);
  if (keys.length === 0) return NextResponse.json({ ok: true });
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => body[k]);
  await run(`UPDATE events SET ${setClause} WHERE id = ?`, [...values, params.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run('DELETE FROM events WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
