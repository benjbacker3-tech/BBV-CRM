import { NextRequest, NextResponse } from 'next/server';
import { all, get, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function GET(req: NextRequest) {
  const contactId = req.nextUrl.searchParams.get('contact_id');
  if (contactId) {
    return NextResponse.json(await all('SELECT * FROM contact_log WHERE contact_id = ? ORDER BY date DESC', [contactId]));
  }
  return NextResponse.json(await all('SELECT * FROM contact_log ORDER BY date DESC'));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await run(
    `INSERT INTO contact_log (contact_id, type, note, date) VALUES (?, ?, ?, ?)`,
    [body.contact_id, body.type, body.note ?? null, body.date]
  );
  await run('UPDATE contacts SET last_contact = ? WHERE id = ?', [body.date, body.contact_id]);
  const contact = await get<{ name: string }>('SELECT name FROM contacts WHERE id = ?', [body.contact_id]);
  await logActivity({ entity_type: 'contact', entity_id: body.contact_id, action: 'logged', description: `${body.type} logged for ${contact?.name || 'contact'}` });
  return NextResponse.json({ id: result.lastInsertRowid });
}
