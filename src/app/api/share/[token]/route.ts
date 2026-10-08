import { NextRequest, NextResponse } from 'next/server';
import { DriveItem, children, graphErrorMessage, itemById } from '@/lib/graph';
import { canUpload, canView, clientIp, itemInShare, logEvent, notifyActivity, openShare } from '@/lib/shares';

export const dynamic = 'force-dynamic';

const pub = (i: DriveItem) => ({ id: i.id, name: i.name, size: i.size, modified: i.lastModifiedDateTime, isFolder: !!i.folder, count: i.folder?.childCount ?? 0 });

// Public. GET ?folder=<id> → the shared item, or a folder inside it, with its contents.
export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const st = await openShare(req, params.token);
  if (!st.ok) return NextResponse.json({ error: st.error, needsPassword: st.needsPassword, name: st.name }, { status: st.status });
  const s = st.share;
  try {
    const folderId = req.nextUrl.searchParams.get('folder');
    const target = folderId && canView(s) ? await itemInShare(s, folderId) : await itemById(s.item_id);
    if (!target) return NextResponse.json({ error: 'This file or folder is no longer available.' }, { status: 404 });
    // Breadcrumb from the shared folder down to the current one.
    const trail: { id: string; name: string }[] = [{ id: target.id, name: target.name }];
    let p = target.id === s.item_id ? undefined : target.parentReference?.id;
    while (p && trail.length < 12) {
      const parent = await itemById(p);
      if (!parent) break;
      trail.unshift({ id: parent.id, name: parent.name });
      if (parent.id === s.item_id) break;
      p = parent.parentReference?.id;
    }
    const items = target.folder && canView(s)
      ? (await children(target.id)).sort((a, b) => (a.folder ? 0 : 1) - (b.folder ? 0 : 1) || a.name.localeCompare(b.name)).map(pub)
      : [];
    if (!folderId) {
      await logEvent(s, 'open', null, clientIp(req));
      await notifyActivity(s, 'open', [], req.nextUrl.origin);
    }
    return NextResponse.json({
      share: { name: s.item_name, recipient: s.recipient, mode: s.mode, isFolder: !!s.is_folder, expires: s.expires_at, canView: canView(s), canUpload: canUpload(s) },
      current: pub(target), trail, items,
    });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
