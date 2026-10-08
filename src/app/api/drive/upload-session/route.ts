import { NextRequest, NextResponse } from 'next/server';
import { createUploadSession, graphConfigured, graphErrorMessage } from '@/lib/graph';

export const dynamic = 'force-dynamic';

// POST { parentId, name } → { uploadUrl }. The browser then uploads the file straight
// to OneDrive in chunks, so file size isn't limited by the CRM's servers.
export async function POST(req: NextRequest) {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected yet.' }, { status: 503 });
  const { parentId, name } = await req.json();
  if (!parentId || !name) return NextResponse.json({ error: 'parentId and name are required' }, { status: 400 });
  try {
    return NextResponse.json({ uploadUrl: await createUploadSession(parentId, String(name).replace(/[\\/:*?"<>|]/g, '-')) });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
