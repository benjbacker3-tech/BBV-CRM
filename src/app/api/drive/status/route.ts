import { NextResponse } from 'next/server';
import { ROOT_PATH, driveOwner, grantedRoles, graphConfigured, graphErrorMessage, itemByPath } from '@/lib/graph';

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
    // Report which application permissions the token carries, to tell a missing
    // admin consent apart from a wrong MS_DRIVE_USER.
    const roles = await grantedRoles().catch(() => null);
    let hint: string | undefined;
    if (roles && !roles.some(r => /^(Files|Sites)\.(Read|ReadWrite)\.All$/.test(r))) {
      hint = 'The app has no Files application permission yet. In Entra → Sandpiper CRM → API permissions, add Microsoft Graph → Application permissions → Files.ReadWrite.All, then Grant admin consent.';
    } else if (roles) {
      hint = `The app has ${roles.join(', ')}. Check that MS_DRIVE_USER (${process.env.MS_DRIVE_USER}) is the exact email of the OneDrive owner and that this user has a OneDrive.`;
    }
    return NextResponse.json({ configured: true, ok: false, error: graphErrorMessage(e), roles, hint });
  }
}
