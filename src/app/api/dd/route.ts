import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { DD_SECTIONS, DD_STAGES } from '@/lib/dd-template';
import { ensureChecklist, checklistItems, dealCosts, legacyNotes } from '@/lib/dd-server';

// GET ?deal_id= → the deal's checklist (created from the template on first open),
// its diligence costs, and the email-sync notes that belong under checklist lines.
export async function GET(req: NextRequest) {
  const dealId = Number(req.nextUrl.searchParams.get('deal_id'));
  if (!dealId) return NextResponse.json({ error: 'deal_id required' }, { status: 400 });
  const deal = await get<{ stage: string }>('SELECT stage FROM deals WHERE id = ?', [dealId]);
  if (!deal) return NextResponse.json({ error: 'Deal not found' }, { status: 404 });
  const active = (DD_STAGES as readonly string[]).includes(deal.stage);
  if (active) await ensureChecklist([dealId]);
  const [items, costs, legacy] = await Promise.all([checklistItems([dealId]), dealCosts([dealId]), legacyNotes(dealId)]);
  return NextResponse.json({ active, items, costs, legacy });
}

// POST { deal_id, section, label } → add a custom checklist line at the end of a section.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const dealId = Number(body.deal_id);
  const label = String(body.label ?? '').trim();
  if (!dealId || !label || !DD_SECTIONS.includes(body.section)) {
    return NextResponse.json({ error: 'deal_id, section and label required' }, { status: 400 });
  }
  const last = await get<{ s: number | null }>('SELECT MAX(sort) s FROM dd_items WHERE deal_id = ? AND section = ?', [dealId, body.section]);
  const res = await run(
    `INSERT INTO dd_items (deal_id, item_key, section, grp, label, sort) VALUES (?, 'custom-' || hex(randomblob(4)), ?, ?, ?, ?)`,
    [dealId, body.section, body.grp ?? null, label, (last?.s ?? 0) + 1],
  );
  return NextResponse.json({ id: res.lastInsertRowid });
}
