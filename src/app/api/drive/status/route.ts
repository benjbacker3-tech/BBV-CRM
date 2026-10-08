import { NextResponse } from 'next/server';
import { ROOT_PATH, driveOwner, graphConfigured, graphErrorMessage, itemByPath } from '@/lib/graph';

export const dynamic = 'force-dynamic';

// Connection check for the OneDrive integration.
export async function GET() {
  if (!graphConfigured()) return NextResponse.json({ configured: false, ok: false });
  try {
    const [owner, root] = await Promise.all([driveOwner(), itemByPath('')]);
    if (!root) {
      return NextResponse.json({ configured: true, ok: false, error: `Connected to ${owner.name}'s OneDrive, but there is no "${ROOT_PATH}" folder at its top level.` });
    }
    return NextResponse.json({ configured: true, ok: true, owner: owner.name, rootPath: ROOT_PATH, rootWebUrl: root.webUrl });
  } catch (e) {
    return NextResponse.json({ configured: true, ok: false, error: graphErrorMessage(e) });
  }
}
