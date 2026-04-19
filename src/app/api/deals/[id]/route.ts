import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const deal = await get('SELECT * FROM deals WHERE id = ?', [params.id]);
  if (!deal) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(deal);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const old = await get<Record<string, unknown>>('SELECT * FROM deals WHERE id = ?', [params.id]);

  const keys = Object.keys(body);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => body[k]);
  await run(`UPDATE deals SET ${setClause} WHERE id = ?`, [...values, params.id]);

  const deal = await get('SELECT * FROM deals WHERE id = ?', [params.id]);

  if (old) {
    if (body.stage && body.stage !== old.stage) {
      await logActivity({ entity_type: 'deal', entity_id: Number(params.id), action: 'stage_changed', description: `Stage changed from ${old.stage} to ${body.stage}` });
    }
    if (body.pinned !== undefined && body.pinned !== old.pinned) {
      await logActivity({ entity_type: 'deal', entity_id: Number(params.id), action: body.pinned ? 'pinned' : 'unpinned', description: body.pinned ? 'Deal pinned' : 'Deal unpinned' });
    }
    if (body.notes !== undefined && body.notes !== old.notes) {
      await logActivity({ entity_type: 'deal', entity_id: Number(params.id), action: 'note_edited', description: 'Notes updated' });
    }
  }

  return NextResponse.json(deal);
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  await run('DELETE FROM deals WHERE id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
