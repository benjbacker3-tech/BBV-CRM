import { NextResponse } from 'next/server';
import { jobHealth } from '@/lib/job-health';
import { aiConfigured } from '@/lib/ai';

export const dynamic = 'force-dynamic';

// The automatic jobs' last runs, and whether Claude reading is switched on, for Settings.
export async function GET() {
  return NextResponse.json({ jobs: await jobHealth(), ai: aiConfigured() });
}
