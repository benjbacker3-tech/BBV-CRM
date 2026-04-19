import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function GET(req: NextRequest) {
  const db = getDb();
  const entityType = req.nextUrl.searchParams.get('entity_type');
  const entityId = req.nextUrl.searchParams.get('entity_id');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');

  let query = 'SELECT * FROM activity_log';
  const conditions: string[] = [];
  const filterParams: Record<string, unknown> = {};

  if (entityType) {
    conditions.push('entity_type = @entity_type');
    filterParams.entity_type = entityType;
  }
  if (entityId) {
    conditions.push('entity_id = @entity_id');
    filterParams.entity_id = entityId;
  }

  const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';
  query += whereClause + ' ORDER BY created_at DESC LIMIT @limit OFFSET @offset';

  const entries = db.prepare(query).all({ ...filterParams, limit, offset });

  const countQuery = `SELECT COUNT(*) as c FROM activity_log${whereClause}`;
  const total = conditions.length > 0
    ? db.prepare(countQuery).get(filterParams) as { c: number }
    : db.prepare(countQuery).get() as { c: number };

  return NextResponse.json({ entries, total: total.c });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const db = getDb();
  logActivity(db, body);
  return NextResponse.json({ ok: true });
}
