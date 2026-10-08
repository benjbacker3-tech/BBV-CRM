import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { COMP_FIELDS } from '@/lib/comps';
import { cleanCompInput } from '@/lib/comps-server';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const data = cleanCompInput(await req.json());
  const keys = COMP_FIELDS.filter(k => data[k] !== undefined);
  if (keys.length) {
    await run(
      `UPDATE comps SET ${keys.map(k => `${k} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      [...keys.map(k => data[k] as string | number | null), params.id]
    );
  }
  return NextResponse.json(await get('SELECT * FROM comps WHERE id = ?', [params.id]));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run('DELETE FROM comps WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
