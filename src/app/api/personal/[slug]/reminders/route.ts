import { NextRequest, NextResponse } from 'next/server';
import { all, run } from '@/lib/db';
import { notFound, propertyBySlug } from '@/lib/personal-server';
import { newId } from '@/lib/personal';

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const reminders = await all('SELECT * FROM personal_reminders WHERE property_id = ? AND dismissed = 0 ORDER BY due_date', [p.id]);
  return NextResponse.json({ reminders });
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const b = await req.json();
  if (!b.name || !/^\d{4}-\d{2}-\d{2}$/.test(b.due_date || '')) return NextResponse.json({ error: 'Name and due date are required' }, { status: 400 });
  const recurring = !!b.recurring;
  await run(
    'INSERT INTO personal_reminders (id, property_id, name, due_date, category, amount, recurring, recur_months, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), p.id, String(b.name), b.due_date, b.category || 'Other', typeof b.amount === 'number' ? b.amount : null, recurring ? 1 : 0, recurring ? Number(b.recur_months) || 1 : null, b.notes || null],
  );
  return NextResponse.json({ ok: true });
}
