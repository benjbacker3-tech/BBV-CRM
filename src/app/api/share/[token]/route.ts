import { NextRequest, NextResponse } from 'next/server';
import { DriveItem, children, itemById } from '@/lib/graph';
import { canUpload, canView, clientIp, itemInShare, logEvent, notifyActivity, openShare, publicError, recentEvents } from '@/lib/shares';

export const dynamic = 'force-dynamic';

const pub = (i: DriveItem) => ({ id: i.id, name: i.name, size: i.size, modified: i.lastModifiedDateTime, isFolder: !!i.folder, count: i.folder?.childCount ?? 0 });

// Public. GET ?folder=<id> → the shared item, or a folder inside it, with its contents.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const st = await openShare(req, params.token);
  if (!st.ok) return NextResponse.json({ error: st.error, needsPassword: st.needsPassword, name: st.name }, { status: st.status });
  const s = st.share;
  try {
    const folderId = req.nextUrl.searchParams.get('folder');
    const walked: DriveItem[] = [];
    const target = folderId && folderId !== s.item_id && canView(s) ? await itemInShare(s, folderId, walked) : await itemById(s.item_id);
    if (!target) return NextResponse.json({ error: 'This file or folder is no longer available.' }, { status: 404 });
    // Breadcrumb from the shared folder down to the current one.
    const trail = target.id === s.item_id
      ? [{ id: target.id, name: target.name }]
      : [{ id: s.item_id, name: s.item_name }, ...walked.reverse().map(f => ({ id: f.id, name: f.name })), { id: target.id, name: target.name }];
    const items = target.folder && canView(s)
      ? (await children(target.id)).sort((a, b) => (a.folder ? 0 : 1) - (b.folder ? 0 : 1) || a.name.localeCompare(b.name)).map(pub)
      : [];
    // One "open" per visitor per half hour (breadcrumb clicks and refreshes don't count).
    const ip = clientIp(req);
    if (!folderId && !(await recentEvents(s, 'open', '-30 minutes', ip))) {
      await logEvent(s, 'open', null, ip);
      await notifyActivity(s, 'open', [], req.nextUrl.origin);
    }
    return NextResponse.json({
      share: { name: s.item_name, recipient: s.recipient, mode: s.mode, isFolder: !!s.is_folder, expires: s.expires_at, canView: canView(s), canUpload: canUpload(s) },
      // Upload-only links see the folder's name and nothing else.
      current: canView(s) ? pub(target) : { id: '', name: target.name, size: 0, modified: '', isFolder: true, count: 0 },
      trail: canView(s) ? trail : [{ id: '', name: target.name }],
      items,
    });
  } catch (e) {
    return NextResponse.json({ error: publicError(e, 'list') }, { status: 502 });
  }
}
