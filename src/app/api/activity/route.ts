import { NextRequest, NextResponse } from 'next/server';
import { all, get } from '@/lib/db';
import { logActivity } from '@/lib/activity';

export async function GET(req: NextRequest) {
  const entityType = req.nextUrl.searchParams.get('entity_type');
  const entityId = req.nextUrl.searchParams.get('entity_id');
  const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');
  const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');

  const conditions: string[] = [];
  const filterArgs: (string | number)[] = [];

  if (entityType) { conditions.push('entity_type = ?'); filterArgs.push(entityType); }
  if (entityId) { conditions.push('entity_id = ?'); filterArgs.push(entityId); }

  const whereClause = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

  const entries = await all(
    `SELECT * FROM activity_log${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...filterArgs, limit, offset]
  );

  const total = await get<{ c: number }>(
    `SELECT COUNT(*) as c FROM activity_log${whereClause}`,
    filterArgs.length > 0 ? filterArgs : undefined
  );

  return NextResponse.json({ entries, total: Number(total?.c || 0) });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  await logActivity(body);
  return NextResponse.json({ ok: true });
}
