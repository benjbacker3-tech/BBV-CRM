import { NextResponse } from 'next/server';

// Fetches the US economic calendar from Trading Economics guest API
// (free, no key, rate-limited). Returns this week + last week.
//
// Docs: https://docs.tradingeconomics.com/economic_calendar/
// Guest credentials: c=guest:guest

export const dynamic = 'force-dynamic';
const REVALIDATE = 1800;  // 30 min — calendar updates intraday

export interface CalendarItem {
  id: string;                       // synthetic key
  name: string;
  release_date: string;             // ISO date
  release_time: string | null;      // human ("8:30 AM ET")
  previous_value: string | null;
  consensus: string | null;
  actual_value: string | null;
  importance: 'low' | 'medium' | 'high';
  url: string | null;
}

interface TEEvent {
  CalendarId?: string;
  Date?: string;        // ISO datetime
  Country?: string;
  Category?: string;
  Event?: string;
  Reference?: string;
  Source?: string;
  Actual?: string | number | null;
  Previous?: string | number | null;
  Forecast?: string | number | null;
  TEForecast?: string | number | null;
  Importance?: number;  // 1 (low) – 3 (high)
}

function importanceFromTE(n: number | undefined): 'low' | 'medium' | 'high' {
  if (n == null) return 'medium';
  if (n >= 3) return 'high';
  if (n <= 1) return 'low';
  return 'medium';
}

function fmtVal(v: string | number | null | undefined): string | null {
  if (v == null || v === '') return null;
  return String(v);
}

function fmtTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) + ' ET';
  } catch {
    return '';
  }
}

export async function GET() {
  // Pull a window spanning previous Monday through next Sunday
  const today = new Date();
  const dow = today.getDay() || 7;
  const monday = new Date(today); monday.setDate(today.getDate() - (dow - 1)); monday.setHours(0, 0, 0, 0);
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
  const nextSunday = new Date(monday); nextSunday.setDate(monday.getDate() + 6); nextSunday.setHours(23, 59, 59, 999);

  const d1 = lastMonday.toISOString().split('T')[0];
  const d2 = nextSunday.toISOString().split('T')[0];

  const url = `https://api.tradingeconomics.com/calendar/country/united%20states/${d1}/${d2}?c=guest:guest&format=json`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MCI-CRM/1.0)' },
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) {
      return NextResponse.json({ error: `TE API ${res.status}`, items: [] }, { status: 200 });
    }
    const raw = await res.json() as unknown;
    const events: TEEvent[] = Array.isArray(raw) ? raw as TEEvent[] : [];

    const items: CalendarItem[] = events
      .filter(e => !!e.Date && !!e.Event)
      .map((e, i) => ({
        id: e.CalendarId || `te-${i}-${e.Date}`,
        name: e.Reference ? `${e.Event} (${e.Reference})` : e.Event!,
        release_date: e.Date!.split('T')[0],
        release_time: fmtTime(e.Date!),
        previous_value: fmtVal(e.Previous),
        consensus: fmtVal(e.Forecast ?? e.TEForecast),
        actual_value: fmtVal(e.Actual),
        importance: importanceFromTE(e.Importance),
        url: e.Source ? `https://tradingeconomics.com/united-states/calendar` : null,
      }))
      .sort((a, b) => a.release_date.localeCompare(b.release_date));

    return NextResponse.json({ items, fetched_at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : 'fetch failed',
      items: [],
    }, { status: 200 });
  }
}
