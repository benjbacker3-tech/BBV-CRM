import { NextRequest, NextResponse } from 'next/server';
import { all } from '@/lib/db';

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 2) return NextResponse.json({ deals: [], contacts: [], tasks: [] });

  const pattern = `%${q}%`;

  const deals = await all(
    `SELECT id, name, market, stage, asking_price FROM deals
     WHERE name LIKE ? OR address LIKE ? OR market LIKE ? OR submarket LIKE ?
     LIMIT 8`,
    [pattern, pattern, pattern, pattern]
  );

  const contacts = await all(
    `SELECT id, name, firm, type, warmth, markets FROM contacts
     WHERE name LIKE ? OR firm LIKE ? OR email LIKE ? OR markets LIKE ?
     LIMIT 8`,
    [pattern, pattern, pattern, pattern]
  );

  const tasks = await all(
    `SELECT t.id, t.note, t.type, t.due_date, t.done, c.name as contact_name FROM tasks t
     LEFT JOIN contacts c ON t.contact_id = c.id
     WHERE t.note LIKE ?
     LIMIT 6`,
    [pattern]
  );

  return NextResponse.json({ deals, contacts, tasks });
}
