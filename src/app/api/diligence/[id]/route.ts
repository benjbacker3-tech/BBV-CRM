import { NextRequest, NextResponse } from 'next/server';
import { updateFromBody } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  await updateFromBody('diligence', body, 'id = ?', [params.id]);
  return NextResponse.json({ ok: true });
}
