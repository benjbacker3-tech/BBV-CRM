import { NextRequest, NextResponse } from 'next/server';
import { graphConfigured, graphErrorMessage } from '@/lib/graph';
import { CleanupOp, applyOps, planCleanup } from '@/lib/cleanup';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET → proposed folder cleanup (read-only).
export async function GET() {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected yet.' }, { status: 503 });
  try {
    return NextResponse.json(await planCleanup());
  } catch (e) {
    return NextResponse.json({ error: graphErrorMessage(e) }, { status: 502 });
  }
}

// POST { ops } → apply the selected ops in order. The page sends them in phases
// (folders, then moves, then deletes) and in small batches.
export async function POST(req: NextRequest) {
  if (!graphConfigured()) return NextResponse.json({ error: 'OneDrive is not connected yet.' }, { status: 503 });
  const { ops } = (await req.json()) as { ops: CleanupOp[] };
  if (!Array.isArray(ops) || !ops.length) return NextResponse.json({ results: [] });
  return NextResponse.json({ results: await applyOps(ops) });
}
