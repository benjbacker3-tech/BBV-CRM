import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { PersonalReminder, addMonths, newId } from '@/lib/personal';

// Dismissing a recurring reminder schedules the next one.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  if (body.action !== 'dismiss') return NextResponse.json({ error: 'Bad action' }, { status: 400 });
  const r = await get<PersonalReminder & { property_id: string }>('SELECT * FROM personal_reminders WHERE id = ?', [params.id]);
  if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  await run('UPDATE personal_reminders SET dismissed = 1 WHERE id = ?', [r.id]);
  if (r.recurring) {
    await run(
      'INSERT INTO personal_reminders (id, property_id, name, due_date, category, amount, recurring, recur_months, notes) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)',
      [newId(), r.property_id, r.name, addMonths(r.due_date, r.recur_months || 1), r.category, r.amount, r.recur_months, r.notes],
    );
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run('DELETE FROM personal_reminders WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
