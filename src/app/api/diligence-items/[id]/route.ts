import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const db = getDb();
  const fields = Object.keys(body).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE diligence_items SET ${fields} WHERE id = @id`).run({ ...body, id: params.id });
  if (body.status) {
    const item = db.prepare(`
      SELECT di.label, d.deal_id FROM diligence_items di
      JOIN diligence d ON di.diligence_id = d.id WHERE di.id = ?
    `).get(params.id) as { label: string; deal_id: number } | undefined;
    if (item) {
      logActivity(db, { entity_type: 'diligence', entity_id: item.deal_id, action: 'status_changed', description: `"${item.label}" marked ${body.status}` });
    }
  }
  return NextResponse.json({ ok: true });
}
