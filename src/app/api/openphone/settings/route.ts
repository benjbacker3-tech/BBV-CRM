import { NextRequest, NextResponse } from 'next/server';
import { get, updateFromBody } from '@/lib/db';

// Force dynamic — DB-backed; don't prerender at build time
export const dynamic = 'force-dynamic';

export async function GET() {
  const settings = await get('SELECT * FROM openphone_settings WHERE id = 1');
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  await updateFromBody('openphone_settings', body, 'id = 1', []);
  const updated = await get('SELECT * FROM openphone_settings WHERE id = 1');
  return NextResponse.json(updated);
}
