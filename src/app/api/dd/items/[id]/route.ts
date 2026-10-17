import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';
import { DD_STATUSES, DD_STATUS_LABEL, DdStatus } from '@/lib/dd-template';

const FIELDS = ['status', 'vendor', 'note', 'due_date', 'label'] as const;

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const keys = FIELDS.filter(k => k in body);
  if (!keys.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  if ('status' in body && !DD_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: 'Bad status' }, { status: 400 });
  }
  const before = await get<{ deal_id: number; label: string; status: DdStatus }>(
    'SELECT deal_id, label, status FROM dd_items WHERE id = ?', [params.id],
  );
  if (!before) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const values = keys.map(k => {
    const v = body[k];
    return typeof v === 'string' && k !== 'status' ? (v.trim() || null) : v;
  });
  // A due date set by hand is kept when the contract dates change (see lib/contract-server).
  const manual = 'due_date' in body ? ', due_auto = 0' : '';
  await run(
    `UPDATE dd_items SET ${keys.map(k => `${k} = ?`).join(', ')}${manual}, updated_at = datetime('now') WHERE id = ?`,
    [...values, params.id],
  );
  if (body.status && body.status !== before.status) {
    await logActivity({
      entity_type: 'diligence', entity_id: before.deal_id, action: 'status_changed',
      description: `"${before.label}" marked ${DD_STATUS_LABEL[body.status as DdStatus]}`,
    });
  }
  return NextResponse.json({ ok: true });
}

// Only lines added by hand can be removed; template lines are set to N/A instead.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const res = await run("DELETE FROM dd_items WHERE id = ? AND item_key LIKE 'custom-%'", [params.id]);
  if (!res.rowsAffected) return NextResponse.json({ error: 'Template lines can be set to N/A, not deleted' }, { status: 400 });
  return NextResponse.json({ ok: true });
}
