import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { DD_STAGES, listOfSection } from '@/lib/dd-template';
import { ensureChecklist, checklistItems, dealCosts, legacyNotes } from '@/lib/dd-server';

// GET ?deal_id= → the deal's diligence checklist (created from the template on first
// open), its diligence costs, and the email-sync notes that belong under checklist lines.
// GET ?deal_id=&list=cm → the deal's construction checklist (empty until started).
export async function GET(req: NextRequest) {
  const dealId = Number(req.nextUrl.searchParams.get('deal_id'));
  if (!dealId) return NextResponse.json({ error: 'deal_id required' }, { status: 400 });
  const deal = await get<{ stage: string }>('SELECT stage FROM deals WHERE id = ?', [dealId]);
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  if (req.nextUrl.searchParams.get('list') === 'cm') {
    return NextResponse.json({ items: await checklistItems([dealId], 'cm') });
  }
  const active = (DD_STAGES as readonly string[]).includes(deal.stage);
  if (active) await ensureChecklist([dealId]);
  const [items, costs, legacy] = await Promise.all([checklistItems([dealId]), dealCosts([dealId]), legacyNotes(dealId)]);
  return NextResponse.json({ active, items, costs, legacy });
}

// POST { deal_id, section, label, due_date? } → add a custom line at the end of a section.
// POST { deal_id, start: 'cm' } → start the deal's construction checklist from the template.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const dealId = Number(body.deal_id);
  if (dealId && body.start === 'cm') {
    await ensureChecklist([dealId], 'cm');
    return NextResponse.json({ ok: true });
  }
  const label = String(body.label ?? '').trim();
  const list = listOfSection(body.section);
  if (!dealId || !label || !list) {
    return NextResponse.json({ error: 'deal_id, section and label required' }, { status: 400 });
  }
  const last = await get<{ s: number | null }>('SELECT MAX(sort) s FROM dd_items WHERE deal_id = ? AND list = ? AND section = ?', [dealId, list, body.section]);
  const res = await run(
    `INSERT INTO dd_items (deal_id, list, item_key, section, grp, label, sort, due_date) VALUES (?, ?, 'custom-' || hex(randomblob(4)), ?, ?, ?, ?, ?)`,
    [dealId, list, body.section, body.grp ?? null, label, (last?.s ?? 0) + 1, body.due_date || null],
  );
  return NextResponse.json({ id: res.lastInsertRowid });
}
