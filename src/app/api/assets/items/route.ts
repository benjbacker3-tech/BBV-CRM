import { NextRequest, NextResponse } from 'next/server';
import { all, get, run } from '@/lib/db';
import { ASSET_CATEGORIES, AssetItem, STANDARD_DATES, daysTo } from '@/lib/asset-bulletin';

// GET ?deal_id=N            → that asset's dates and notes
// GET ?upcoming=1           → open dates across closed deals that are overdue or inside their
//                             lead window (for the Dashboard and the Assets list)
export async function GET(req: NextRequest) {
  const dealId = req.nextUrl.searchParams.get('deal_id');
  if (dealId) {
    const items = await all<AssetItem>('SELECT * FROM asset_items WHERE deal_id = ? ORDER BY kind, CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date, pinned DESC, created_at DESC', [dealId]);
    return NextResponse.json({ items });
  }
  const rows = await all<AssetItem & { deal_name: string; deal_address: string | null }>(
    `SELECT i.*, d.name AS deal_name, d.address AS deal_address FROM asset_items i JOIN deals d ON d.id = i.deal_id
     WHERE i.kind = 'date' AND i.due_date IS NOT NULL AND i.done_at IS NULL AND d.stage = 'Closed' ORDER BY i.due_date`,
  );
  const upcoming = rows.filter(r => daysTo(r.due_date!) <= (r.lead_days ?? 60));
  const next = rows.filter(r => daysTo(r.due_date!) >= 0);
  return NextResponse.json({ upcoming, next });
}

const str = (v: unknown, max = 4000) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const day = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const int = (v: unknown) => (v === null || v === '' || v === undefined ? null : Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);
const cat = (v: unknown) => ((ASSET_CATEGORIES as readonly string[]).includes(String(v)) ? String(v) : 'Other');

// Body: { deal_id, kind: 'date' | 'note', ... } for one item, or { deal_id, standard: true } to add
// the standard key dates (without dates) that the asset doesn't already have.
export async function POST(req: NextRequest) {
  const b = await req.json();
  const dealId = Number(b.deal_id);
  if (!dealId || !(await get('SELECT id FROM deals WHERE id = ?', [dealId]))) return NextResponse.json({ error: 'Unknown deal' }, { status: 400 });

  if (b.standard) {
    const have = new Set((await all<{ title: string }>("SELECT title FROM asset_items WHERE deal_id = ? AND kind = 'date'", [dealId])).map(r => r.title.toLowerCase()));
    let added = 0;
    for (const s of STANDARD_DATES) {
      if (have.has(s.title.toLowerCase())) continue;
      await run("INSERT INTO asset_items (deal_id, kind, category, title, body, recur_months, lead_days) VALUES (?, 'date', ?, ?, ?, ?, ?)",
        [dealId, s.category, s.title, s.body ?? null, s.recur_months, s.lead_days]);
      added++;
    }
    return NextResponse.json({ added });
  }

  if (b.kind === 'note') {
    const body = str(b.body);
    if (!body) return NextResponse.json({ error: 'Note is empty' }, { status: 400 });
    await run("INSERT INTO asset_items (deal_id, kind, category, title, body, pinned) VALUES (?, 'note', ?, ?, ?, ?)",
      [dealId, cat(b.category), str(b.title, 200) ?? '', body, b.pinned ? 1 : 0]);
  } else {
    const title = str(b.title, 200);
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    await run("INSERT INTO asset_items (deal_id, kind, category, title, body, due_date, recur_months, lead_days) VALUES (?, 'date', ?, ?, ?, ?, ?, ?)",
      [dealId, cat(b.category), title, str(b.body), day(b.due_date), int(b.recur_months) || null, int(b.lead_days) ?? 60]);
  }
  return NextResponse.json({ ok: true }, { status: 201 });
}
