import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';

export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get('deal_id');
  if (dealId) {
    return NextResponse.json(await all('SELECT * FROM contacts WHERE deal_id = ?', [dealId]));
  }
  return NextResponse.json(await all('SELECT * FROM contacts ORDER BY last_contact DESC'));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await run(
    `INSERT INTO contacts (deal_id, type, name, firm, phone, email, markets, warmth, last_contact, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [body.deal_id ?? null, body.type, body.name, body.firm ?? null, body.phone ?? null, body.email ?? null, body.markets ?? null, body.warmth ?? 'cool', body.last_contact ?? null, body.notes ?? null]
  );
  return NextResponse.json({ id: result.lastInsertRowid });
}
