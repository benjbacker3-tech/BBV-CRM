import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function GET(req: NextRequest) {
  const db = getDb();
  const contactId = req.nextUrl.searchParams.get('contact_id');
  if (contactId) {
    return NextResponse.json(db.prepare('SELECT * FROM tasks WHERE contact_id = ? ORDER BY due_date').all(contactId));
  }
  return NextResponse.json(db.prepare('SELECT * FROM tasks ORDER BY due_date').all());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO tasks (contact_id, type, note, due_date, done)
    VALUES (@contact_id, @type, @note, @due_date, @done)
  `).run({ done: 0, ...body });
  logActivity(db, { entity_type: 'task', entity_id: Number(result.lastInsertRowid), action: 'created', description: `Task created: ${body.note || body.type}` });
  return NextResponse.json({ id: result.lastInsertRowid });
}
