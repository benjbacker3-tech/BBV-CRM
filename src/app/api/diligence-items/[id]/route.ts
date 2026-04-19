import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const keys = Object.keys(body);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => body[k]);
  await run(`UPDATE diligence_items SET ${setClause} WHERE id = ?`, [...values, params.id]);
  if (body.status) {
    const item = await get<{ label: string; deal_id: number }>(
      `SELECT di.label, d.deal_id FROM diligence_items di JOIN diligence d ON di.diligence_id = d.id WHERE di.id = ?`,
      [params.id]
    );
    if (item) {
      await logActivity({ entity_type: 'diligence', entity_id: Number(item.deal_id), action: 'status_changed', description: `"${item.label}" marked ${body.status}` });
    }
  }
  return NextResponse.json({ ok: true });
}
