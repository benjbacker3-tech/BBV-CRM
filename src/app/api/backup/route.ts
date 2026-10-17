import { NextResponse } from 'next/server';
import { graphConfigured, graphErrorMessage } from '@/lib/graph';
import { backupToOneDrive, lastBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Settings → Backups: the last backup, and "Back up now".
export async function GET() {
  return NextResponse.json({ last: await lastBackup(), connected: graphConfigured() });
}

export async function POST() {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected' }, { status: 400 });
  try {
    return NextResponse.json(await backupToOneDrive());
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}
