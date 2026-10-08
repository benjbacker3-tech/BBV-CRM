import { NextRequest, NextResponse } from 'next/server';
import { get } from '@/lib/db';
import { canUpload, clientIp, itemInShare, logEvent, notifyActivity, openShare } from '@/lib/shares';

export const dynamic = 'force-dynamic';

// Public. POST { ids: [...] } after an upload batch finishes → log each file that is
// really in the shared folder and was uploaded through this link in the last day, once,
// then email Ben once for the batch. Replays of old ids log nothing and send nothing.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const st = await openShare(req, params.token);
  if (!st.ok) return NextResponse.json({ error: st.error }, { status: st.status });
  if (!canUpload(st.share)) return NextResponse.json({ error: 'This link does not allow uploads.' }, { status: 403 });
  const { ids } = await req.json().catch(() => ({}));
  const lines: string[] = [];
  for (const id of Array.from(new Set((Array.isArray(ids) ? ids : []).map(String))).slice(0, 100)) {
    const item = await itemInShare(st.share, id).catch(() => null);
    if (!item?.file) continue;
    // Started through this link (OneDrive may have added " 1" to the name), not yet logged.
    const stem = item.name.replace(/ \d+(\.[^.]+)$/, '$1');
    const started = await get('SELECT id FROM share_events WHERE share_id = ? AND kind = ? AND detail IN (?, ?) AND created_at > datetime(\'now\', \'-1 day\')',
      [st.share.id, 'upload_start', item.name, stem]);
    const logged = await get('SELECT id FROM share_events WHERE share_id = ? AND kind = ? AND detail = ? AND created_at > datetime(\'now\', \'-1 day\')', [st.share.id, 'upload', item.name]);
    if (!started || logged) continue;
    await logEvent(st.share, 'upload', item.name, clientIp(req));
    lines.push(`${item.name} (${Math.max(1, Math.round((item.size ?? 0) / 1024))} KB)`);
  }
  if (lines.length) await notifyActivity(st.share, 'upload', lines, req.nextUrl.origin);
  return NextResponse.json({ logged: lines.length });
}
