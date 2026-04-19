import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const keys = Object.keys(body);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => body[k]);
  await run(`UPDATE tasks SET ${setClause} WHERE id = ?`, [...values, params.id]);
  if (body.done === 1) {
    const task = await get<{ note: string }>('SELECT * FROM tasks WHERE id = ?', [params.id]);
    await logActivity({ entity_type: 'task', entity_id: Number(params.id), action: 'completed', description: `Task completed: ${task?.note || 'task'}` });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run('DELETE FROM tasks WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
