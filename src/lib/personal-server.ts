// Server-side lookups for the personal properties (see lib/personal.ts).
import { NextResponse } from 'next/server';
import { get } from './db';
import { PersonalProperty, isPersonalSlug } from './personal';

export async function propertyBySlug(slug: string): Promise<PersonalProperty | null> {
  if (!isPersonalSlug(slug)) return null;
  return (await get<PersonalProperty>('SELECT * FROM personal_properties WHERE slug = ?', [slug])) ?? null;
}

export const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
