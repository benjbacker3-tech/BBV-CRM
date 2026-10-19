import { NextRequest, NextResponse } from 'next/server';
import { get, updateFromBody } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  await updateFromBody('diligence_items', body, 'id = ?', [params.id]);
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
