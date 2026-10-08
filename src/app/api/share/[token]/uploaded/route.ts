import { NextRequest, NextResponse } from 'next/server';
import { canUpload, clientIp, itemInShare, logEvent, notifyActivity, openShare } from '@/lib/shares';

export const dynamic = 'force-dynamic';

// Public. POST { ids: [...] } after an upload batch finishes → log each file that is
// really in the shared folder, then email Ben once for the batch.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const st = await openShare(req, params.token);
  if (!st.ok) return NextResponse.json({ error: st.error }, { status: st.status });
  if (!canUpload(st.share)) return NextResponse.json({ error: 'This link does not allow uploads.' }, { status: 403 });
  const { ids } = await req.json();
  const lines: string[] = [];
  for (const id of (Array.isArray(ids) ? ids : []).slice(0, 100)) {
    const item = await itemInShare(st.share, String(id)).catch(() => null);
    if (!item?.file) continue;
    await logEvent(st.share, 'upload', item.name, clientIp(req));
    lines.push(`${item.name} (${Math.max(1, Math.round((item.size ?? 0) / 1024))} KB)`);
  }
  if (lines.length) await notifyActivity(st.share, 'upload', lines, req.nextUrl.origin);
  return NextResponse.json({ logged: lines.length });
}
