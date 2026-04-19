import { NextRequest, NextResponse } from 'next/server';
import { run } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const keys = Object.keys(body);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => body[k]);
  await run(`UPDATE diligence SET ${setClause} WHERE id = ?`, [...values, params.id]);
  return NextResponse.json({ ok: true });
}
