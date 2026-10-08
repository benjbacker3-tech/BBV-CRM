import { NextRequest, NextResponse } from 'next/server';
import { createUploadSession } from '@/lib/graph';
import { canUpload, canView, clientIp, itemInShare, logEvent, openShare, publicError, recentEvents } from '@/lib/shares';

export const dynamic = 'force-dynamic';

// A vendor sending a data room is a few hundred files at most.
const MAX_UPLOADS_PER_DAY = 500;

// Public. POST { name, folderId? } → { uploadUrl }; the browser sends the bytes to
// OneDrive directly. Upload-only links always upload into the shared folder itself.
// Each upload is logged here, when it starts, so it is on record even if the visitor
// never reports it finished.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const st = await openShare(req, params.token);
  if (!st.ok) return NextResponse.json({ error: st.error }, { status: st.status });
  if (!canUpload(st.share)) return NextResponse.json({ error: 'This link does not allow uploads.' }, { status: 403 });
  const { name, folderId } = await req.json().catch(() => ({}));
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (await recentEvents(st.share, 'upload_start', '-1 day') >= MAX_UPLOADS_PER_DAY) {
    return NextResponse.json({ error: 'Upload limit for today reached. Ask the sender to raise it.' }, { status: 429 });
  }
  try {
    let parentId = st.share.item_id;
    if (folderId && folderId !== parentId && canView(st.share)) {
      const f = await itemInShare(st.share, String(folderId));
      if (!f?.folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
      parentId = f.id;
    }
    const safe = String(name).replace(/[\\/:*?"<>|]/g, '-').slice(0, 200);
    const uploadUrl = await createUploadSession(parentId, safe);
    await logEvent(st.share, 'upload_start', safe, clientIp(req));
    return NextResponse.json({ uploadUrl });
  } catch (e) {
    return NextResponse.json({ error: publicError(e, 'upload') }, { status: 502 });
  }
}
