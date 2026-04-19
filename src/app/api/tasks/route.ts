import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get('contact_id');
  if (contactId) {
    return NextResponse.json(await all('SELECT * FROM tasks WHERE contact_id = ? ORDER BY due_date', [contactId]));
  }
  return NextResponse.json(await all('SELECT * FROM tasks ORDER BY due_date'));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await run(
    `INSERT INTO tasks (contact_id, type, note, due_date, done) VALUES (?, ?, ?, ?, ?)`,
    [body.contact_id, body.type, body.note ?? null, body.due_date ?? null, body.done ?? 0]
  );
  await logActivity({ entity_type: 'task', entity_id: result.lastInsertRowid, action: 'created', description: `Task created: ${body.note || body.type}` });
  return NextResponse.json({ id: result.lastInsertRowid });
}
