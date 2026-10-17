import { NextResponse } from 'next/server';
import { all } from '@/lib/db';
import { PersonalProperty, currentMonth } from '@/lib/personal';

// The personal properties with this month's status, for the Assets page.
export async function GET() {
  const month = currentMonth();
  const props = await all<PersonalProperty>('SELECT * FROM personal_properties ORDER BY slug');
  const out = [];
  for (const p of props) {
    const [checkin] = await all<{ rent_received: number; mortgage_paid: number; completed_at: string | null }>(
      'SELECT rent_received, mortgage_paid, completed_at FROM personal_checkins WHERE property_id = ? AND month = ?', [p.id, month]);
    const [owed] = await all<{ owed: number | null }>(
      'SELECT SUM(COALESCE(amount_paid, 0) - COALESCE(amount_recharged, 0)) AS owed FROM personal_utility_bills WHERE property_id = ?', [p.id]);
    const [next] = await all<{ name: string; due_date: string }>(
      'SELECT name, due_date FROM personal_reminders WHERE property_id = ? AND dismissed = 0 ORDER BY due_date LIMIT 1', [p.id]);
    out.push({ ...p, month, checkin: checkin ?? null, utilitiesOwed: Math.round((owed?.owed ?? 0) * 100) / 100, nextReminder: next ?? null });
  }
  return NextResponse.json(out);
}
