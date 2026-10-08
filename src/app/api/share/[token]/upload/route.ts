import { NextRequest, NextResponse } from 'next/server';
import { createUploadSession, graphErrorMessage } from '@/lib/graph';
import { canUpload, canView, itemInShare, openShare } from '@/lib/shares';

export const dynamic = 'force-dynamic';

// Public. POST { name, folderId? } → { uploadUrl }; the browser sends the bytes to
// OneDrive directly. Upload-only links always upload into the shared folder itself.
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const st = await openShare(req, params.token);
  if (!st.ok) return NextResponse.json({ error: st.error }, { status: st.status });
  if (!canUpload(st.share)) return NextResponse.json({ error: 'This link does not allow uploads.' }, { status: 403 });
  const { name, folderId } = await req.json();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  try {
    let parentId = st.share.item_id;
    if (folderId && folderId !== parentId && canView(st.share)) {
      const f = await itemInShare(st.share, String(folderId));
      if (!f?.folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
      parentId = f.id;
    }
    return NextResponse.json({ uploadUrl: await createUploadSession(parentId, String(name).replace(/[\\/:*?"<>|]/g, '-').slice(0, 200)) });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
