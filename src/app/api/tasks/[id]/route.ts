import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const db = getDb();
  const fields = Object.keys(body).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE tasks SET ${fields} WHERE id = @id`).run({ ...body, id: params.id });
  if (body.done === 1) {
    const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(params.id) as { note: string } | undefined;
    logActivity(db, { entity_type: 'task', entity_id: Number(params.id), action: 'completed', description: `Task completed: ${task?.note || 'task'}` });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  db.prepare('DELETE FROM tasks WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}
