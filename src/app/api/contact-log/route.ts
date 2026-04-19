import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function GET(req: NextRequest) {
  const db = getDb();
  const contactId = req.nextUrl.searchParams.get('contact_id');
  if (contactId) {
    return NextResponse.json(db.prepare('SELECT * FROM contact_log WHERE contact_id = ? ORDER BY date DESC').all(contactId));
  }
  return NextResponse.json(db.prepare('SELECT * FROM contact_log ORDER BY date DESC').all());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const result = db.prepare(`
    INSERT INTO contact_log (contact_id, type, note, date)
    VALUES (@contact_id, @type, @note, @date)
  `).run(body);
  db.prepare('UPDATE contacts SET last_contact = @date WHERE id = @contact_id').run(body);
  const contact = db.prepare('SELECT name FROM contacts WHERE id = ?').get(body.contact_id) as { name: string } | undefined;
  logActivity(db, { entity_type: 'contact', entity_id: body.contact_id, action: 'logged', description: `${body.type} logged for ${contact?.name || 'contact'}` });
  return NextResponse.json({ id: result.lastInsertRowid });
}
