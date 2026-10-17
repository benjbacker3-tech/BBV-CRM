// Server-side lookups for the personal properties (see lib/personal.ts).
import { NextResponse } from 'next/server';
import { get, run } from './db';
import { PersonalProperty, isPersonalSlug, newId, round2 } from './personal';

export async function propertyBySlug(slug: string): Promise<PersonalProperty | null> {
  if (!isPersonalSlug(slug)) return null;
  return (await get<PersonalProperty>('SELECT * FROM personal_properties WHERE slug = ?', [slug])) ?? null;
}

export const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

export async function addTx(propertyId: string, t: { date: string; description: string; category: string; type: 'Income' | 'Expense'; amount: number; source?: string | null; notes?: string | null }) {
  await run(
    'INSERT INTO personal_transactions (id, property_id, date, description, category, type, amount, source, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [newId(), propertyId, t.date, t.description, t.category, t.type, round2(t.amount), t.source ?? null, t.notes ?? null],
  );
}
