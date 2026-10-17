import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { ASSET_CATEGORIES, AssetItem, addMonths, daysTo } from '@/lib/asset-bulletin';

// Today's date. The page sends the browser's local date (the server runs on UTC, a day ahead
// on Mountain-time evenings); this is the fallback.
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Body: { action: 'done' } marks a date handled (a recurring one rolls forward past today; a
// one-time one is set aside), { action: 'reopen' } undoes a one-time done, otherwise edits
// fields: title, body, category, due_date, recur_months, lead_days, pinned.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const item = await get<AssetItem>('SELECT * FROM asset_items WHERE id = ?', [params.id]);
  if (!item) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await req.json();

  if (b.action === 'done') {
    if (item.recur_months && item.due_date) {
      let next = addMonths(item.due_date, item.recur_months);
      while (daysTo(next) < 0) next = addMonths(next, item.recur_months);
      await run('UPDATE asset_items SET due_date = ?, last_done = ? WHERE id = ?', [next, /^\d{4}-\d{2}-\d{2}$/.test(b.today || '') ? b.today : today(), item.id]);
    } else {
      await run('UPDATE asset_items SET done_at = ? WHERE id = ?', [new Date().toISOString(), item.id]);
    }
  } else if (b.action === 'reopen') {
    await run('UPDATE asset_items SET done_at = NULL WHERE id = ?', [item.id]);
  } else {
    const set: string[] = [];
    const args: (string | number | null)[] = [];
    const put = (col: string, v: string | number | null) => { set.push(`${col} = ?`); args.push(v); };
    if ('title' in b) put('title', String(b.title || '').trim().slice(0, 200));
    if ('body' in b) put('body', typeof b.body === 'string' && b.body.trim() ? b.body.trim().slice(0, 4000) : null);
    if ('category' in b) put('category', (ASSET_CATEGORIES as readonly string[]).includes(b.category) ? b.category : 'Other');
    if ('due_date' in b) put('due_date', typeof b.due_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.due_date) ? b.due_date : null);
    if ('recur_months' in b) put('recur_months', Number(b.recur_months) > 0 ? Math.round(Number(b.recur_months)) : null);
    if ('lead_days' in b) put('lead_days', Number(b.lead_days) >= 0 ? Math.round(Number(b.lead_days)) : 60);
    if ('pinned' in b) put('pinned', b.pinned ? 1 : 0);
    if (set.length) await run(`UPDATE asset_items SET ${set.join(', ')} WHERE id = ?`, [...args, item.id]);
  }
  return NextResponse.json(await get('SELECT * FROM asset_items WHERE id = ?', [item.id]));
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run('DELETE FROM asset_items WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
