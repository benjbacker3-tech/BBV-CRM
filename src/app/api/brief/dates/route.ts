import { NextRequest, NextResponse } from 'next/server';
import { myDates } from '@/lib/my-dates';

export const dynamic = 'force-dynamic';

// GET ?today=YYYY-MM-DD (the browser's date) → the next 7 days of Ben's own deadlines.
export async function GET(req: NextRequest) {
  const t = req.nextUrl.searchParams.get('today');
  const today = t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : new Date().toISOString().slice(0, 10);
  return NextResponse.json({ today, dates: await myDates(today, 7) });
}
