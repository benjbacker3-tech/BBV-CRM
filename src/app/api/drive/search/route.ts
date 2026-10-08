import { NextRequest, NextResponse } from 'next/server';
import { ROOT_PATH, graphConfigured, graphErrorMessage, search } from '@/lib/graph';

export const dynamic = 'force-dynamic';

// GET /api/drive/search?q=phase I — file names and contents under the Sandpiper folder.
export async function GET(req: NextRequest) {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected yet.' }, { status: 503 });
  const q = (req.nextUrl.searchParams.get('q') || '').trim();
  if (!q) return NextResponse.json({ items: [] });
  try {
    const items = (await search(q)).map(i => {
      const p = i.parentReference?.path?.split(`root:/${ROOT_PATH}`)[1];
      return { ...i, folderPath: p != null ? p.replace(/^\//, '') : null };
    });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
