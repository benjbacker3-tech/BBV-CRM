import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const db = getDb();
  const dealId = req.nextUrl.searchParams.get('deal_id');
  if (dealId) {
    const contacts = db.prepare('SELECT * FROM contacts WHERE deal_id = ?').all(dealId);
    return NextResponse.json(contacts);
  }
  const contacts = db.prepare('SELECT * FROM contacts ORDER BY last_contact DESC').all();
  return NextResponse.json(contacts);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO contacts (deal_id, type, name, firm, phone, email, markets, warmth, last_contact, notes)
    VALUES (@deal_id, @type, @name, @firm, @phone, @email, @markets, @warmth, @last_contact, @notes)
  `);
  const result = stmt.run(body);
  return NextResponse.json({ id: result.lastInsertRowid });
}
