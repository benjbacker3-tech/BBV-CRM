import { NextRequest, NextResponse } from 'next/server';
import { notFound, propertyBySlug } from '@/lib/personal-server';
import { categorizeLine } from '@/lib/personal-audit';
import { LEDGER_CATEGORIES, NOTE_CATEGORY } from '@/lib/personal';

// PATCH { category, remember } → file a statement line (and, with remember, every waiting line
// from the same payee, now and in future imports).
export async function PATCH(req: NextRequest, { params }: { params: { slug: string; id: string } }) {
  const p = await propertyBySlug(params.slug);
  if (!p) return notFound();
  const b = await req.json();
  const ok = (LEDGER_CATEGORIES as readonly string[]).includes(b.category) || (b.category === NOTE_CATEGORY && p.slug === 'emerson');
  if (!ok) return NextResponse.json({ error: 'Unknown category' }, { status: 400 });
  try {
    return NextResponse.json({ filed: await categorizeLine(p, params.id, b.category, b.remember !== false) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
