import { NextRequest, NextResponse } from 'next/server';
import { downloadUrl } from '@/lib/graph';
import { canView, clientIp, itemInShare, logEvent, openShare, publicError } from '@/lib/shares';

export const dynamic = 'force-dynamic';

// Public. GET ?id=<file id> → redirect to a short-lived OneDrive download URL.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const st = await openShare(req, params.token);
  if (!st.ok) return NextResponse.json({ error: st.error }, { status: st.status });
  if (!canView(st.share)) return NextResponse.json({ error: 'This link is upload-only.' }, { status: 403 });
  try {
    const item = await itemInShare(st.share, req.nextUrl.searchParams.get('id') || '');
    if (!item?.file) return NextResponse.json({ error: 'File not found' }, { status: 404 });
    await logEvent(st.share, 'download', item.name, clientIp(req));
    return NextResponse.redirect(await downloadUrl(item.id));
  } catch (e) {
    return NextResponse.json({ error: publicError(e, 'download') }, { status: 502 });
  }
}
