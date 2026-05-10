import { NextRequest, NextResponse } from 'next/server';
import { get, run } from '@/lib/db';

// Force dynamic — DB-backed; don't prerender at build time
export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await get('SELECT * FROM openphone_settings WHERE id = 1');
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const keys = Object.keys(body);
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => body[k]);
  await run(`UPDATE openphone_settings SET ${setClause} WHERE id = 1`, values);
  const updated = await get('SELECT * FROM openphone_settings WHERE id = 1');
  return NextResponse.json(updated);
}
