import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { Lead } from '@/lib/leads';

const n = (v: unknown) => (v === '' || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : null);
const s = (v: unknown, max = 200) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

// Body: { action: 'keep', ...fields } adds the lead to the Pipeline as a Tracking deal (fields
// as Ben confirmed them); { action: 'dismiss' } / { action: 'restore' } move it between lists.
export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const lead = await get<Lead>('SELECT * FROM leads WHERE id = ?', [params.id]);
  if (!lead) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const b = await req.json();

  if (b.action === 'dismiss' || b.action === 'restore') {
    await run('UPDATE leads SET status = ? WHERE id = ?', [b.action === 'dismiss' ? 'dismissed' : 'new', lead.id]);
    return NextResponse.json({ ok: true });
  }
  if (b.action !== 'keep') return NextResponse.json({ error: 'Bad action' }, { status: 400 });
  if (lead.deal_id) return NextResponse.json({ error: 'Already added', deal_id: lead.deal_id }, { status: 409 });

  const address = s(b.address) ?? s(lead.address);
  const name = address || s(b.name) || s(lead.subject, 80) || 'Broker lead';
  const broker = [lead.sender_name, lead.firm].filter(Boolean).join(', ');
  const notes = [
    `From broker email: "${lead.subject ?? ''}"${broker ? ` (${broker})` : ''}, ${lead.received_at.slice(0, 10)}.`,
    n(b.cap_rate) ?? lead.cap_rate ? `Quoted cap rate ${n(b.cap_rate) ?? lead.cap_rate}%.` : '',
    s(b.notes, 2000) ?? '',
  ].filter(Boolean).join(' ');
  const r = await run(
    `INSERT INTO deals (name, address, city, state, sf, acreage, asking_price, stage, source, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'Tracking', ?, ?)`,
    [name, address, s(b.city) ?? lead.city, (s(b.state) ?? lead.state)?.toUpperCase() ?? null,
      n(b.sf) ?? lead.sf ?? 0, n(b.acres) ?? lead.acres ?? 0, n(b.price) ?? lead.price ?? 0,
      broker ? `Broker: ${broker}` : 'Broker email', notes],
  );
  await run("UPDATE leads SET status = 'kept', deal_id = ? WHERE id = ?", [r.lastInsertRowid, lead.id]);
  await logActivity({ entity_type: 'deal', entity_id: r.lastInsertRowid, action: 'created', description: `Added from broker lead: ${lead.subject ?? name}` });
  return NextResponse.json({ ok: true, deal_id: r.lastInsertRowid });
}
