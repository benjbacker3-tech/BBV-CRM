import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ deals: [], contacts: [], tasks: [] });

  const db = getDb();
  const pattern = `%${q}%`;

  const deals = db.prepare(`
    SELECT id, name, market, stage, asking_price FROM deals
    WHERE name LIKE ? OR address LIKE ? OR market LIKE ? OR submarket LIKE ?
    LIMIT 8
  `).all(pattern, pattern, pattern, pattern);

  const contacts = db.prepare(`
    SELECT id, name, firm, type, warmth, markets FROM contacts
    WHERE name LIKE ? OR firm LIKE ? OR email LIKE ? OR markets LIKE ?
    LIMIT 8
  `).all(pattern, pattern, pattern, pattern);

  const tasks = db.prepare(`
    SELECT t.id, t.note, t.type, t.due_date, t.done, c.name as contact_name FROM tasks t
    LEFT JOIN contacts c ON t.contact_id = c.id
    WHERE t.note LIKE ?
    LIMIT 6
  `).all(pattern);

  return NextResponse.json({ deals, contacts, tasks });
}
