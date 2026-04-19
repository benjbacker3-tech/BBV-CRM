import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(params.id);
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(deal);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const db = getDb();
  const old = db.prepare('SELECT * FROM deals WHERE id = ?').get(params.id) as Record<string, unknown> | undefined;
  const fields = Object.keys(body).map(k => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE deals SET ${fields} WHERE id = @id`).run({ ...body, id: params.id });
  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(params.id) as Record<string, unknown>;

  // Log activity for meaningful changes
  if (old) {
    if (body.stage && body.stage !== old.stage) {
      logActivity(db, { entity_type: 'deal', entity_id: Number(params.id), action: 'stage_changed', description: `Stage changed from ${old.stage} to ${body.stage}` });
    }
    if (body.pinned !== undefined && body.pinned !== old.pinned) {
      logActivity(db, { entity_type: 'deal', entity_id: Number(params.id), action: body.pinned ? 'pinned' : 'unpinned', description: body.pinned ? `Deal pinned` : `Deal unpinned` });
    }
    if (body.notes !== undefined && body.notes !== old.notes) {
      logActivity(db, { entity_type: 'deal', entity_id: Number(params.id), action: 'note_edited', description: 'Notes updated' });
    }
  }

  return NextResponse.json(deal);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const db = getDb();
  db.prepare('DELETE FROM deals WHERE id = ?').run(params.id);
  return NextResponse.json({ ok: true });
}
