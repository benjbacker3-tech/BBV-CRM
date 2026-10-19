import { NextRequest, NextResponse } from 'next/server';
import { run, updateFromBody } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  await updateFromBody('economic_releases', body, 'id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run('DELETE FROM economic_releases WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
