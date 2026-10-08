import { NextRequest, NextResponse } from 'next/server';
import { children, graphConfigured, graphErrorMessage, itemByPath } from '@/lib/graph';

export const dynamic = 'force-dynamic';

// GET /api/drive/browse?path=Acquisitions/1862 Ives, Kent, WA  (relative to the Sandpiper root)
export async function GET(req: NextRequest) {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected yet.' }, { status: 503 });
  const path = (req.nextUrl.searchParams.get('path') || '').replace(/^\/+|\/+$/g, '');
  try {
    const folder = await itemByPath(path);
    if (!folder) return NextResponse.json({ error: `Folder not found: ${path || '/'}` }, { status: 404 });
    const items = (await children(folder.id)).sort((a, b) => (a.folder ? 0 : 1) - (b.folder ? 0 : 1) || a.name.localeCompare(b.name));
    return NextResponse.json({ path, folder, items });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
