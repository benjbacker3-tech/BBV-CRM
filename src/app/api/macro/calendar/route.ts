import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';

// Fetches the US economic calendar by scraping Forex Factory's weekly view.
// The page embeds the full week's data as JSON inside a JS assignment
// (`window.calendarComponentStates[1] = { days: [...] }`). We extract that,
// filter to US events, and normalize.
//
// Why FF: Trading Economics killed their public guest endpoint and the other
// well-known free calendars (MarketWatch, Investing) gate or block crawlers.
// FF returns 200 with a plain UA and the data is structurally stable.
//
// Caching: weekly via unstable_cache + tag. ?force=1 calls revalidateTag.

export const dynamic = 'force-dynamic';
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const TAG = 'macro-calendar';

export interface CalendarItem {
  id: string;
  name: string;
  release_date: string;             // ISO date (YYYY-MM-DD)
  release_time: string | null;      // human ("8:30 AM ET")
  previous_value: string | null;
  consensus: string | null;
  actual_value: string | null;
  importance: 'low' | 'medium' | 'high';
  url: string | null;
}

interface FFEvent {
  id?: number;
  name?: string;
  country?: string;
  impactName?: string;       // "low" | "medium" | "high" | "holiday" | "non-economic"
  impactTitle?: string;
  timeLabel?: string;        // e.g. "8:30am", "All Day", "Tentative"
  dateline?: number;         // unix seconds
  date?: string;             // "May 10, 2026"
  actual?: string;
  previous?: string;
  forecast?: string;
  url?: string;
  prefixedName?: string;
}

interface FFDay {
  date?: string;
  dateline?: number;
  events?: FFEvent[];
}

function nullish(v: string | undefined | null): string | null {
  if (v == null) return null;
  const t = String(v).trim();
  return t ? t : null;
}

function normalizeImpact(s: string | undefined): 'low' | 'medium' | 'high' {
  const v = (s || '').toLowerCase();
  if (v === 'high') return 'high';
  if (v === 'low') return 'low';
  return 'medium';
}

function fmtTimeFromLabel(timeLabel: string | undefined): string | null {
  if (!timeLabel) return null;
  const lbl = timeLabel.trim();
  if (!lbl || /^all\s*day$/i.test(lbl) || /^tentative$/i.test(lbl)) return lbl;
  // FF labels look like "8:30am" / "10:00pm" — append ET (FF defaults to NY time)
  return `${lbl.toUpperCase()} ET`;
}

function dateFromDateline(sec: number | undefined): string {
  if (!sec) return '';
  try { return new Date(sec * 1000).toISOString().split('T')[0]; }
  catch { return ''; }
}

// Pull "window.calendarComponentStates[N] = { ... };" block(s) and parse the
// `days: [...]` array out. We can't JSON.parse the whole object literal (keys
// are bare identifiers), but `days: [...]` is valid JSON because all its
// content is double-quoted.
function extractFFDays(html: string): FFDay[] {
  const out: FFDay[] = [];
  const stateRe = /window\.calendarComponentStates\[\d+\]\s*=\s*\{([\s\S]*?)\n\s*\};/g;
  let m: RegExpExecArray | null;
  while ((m = stateRe.exec(html)) !== null) {
    const body = m[1];
    // Find the `days:` array via brace matching from its opening [
    const daysIdx = body.indexOf('days:');
    if (daysIdx < 0) continue;
    const arrStart = body.indexOf('[', daysIdx);
    if (arrStart < 0) continue;
    // Match brackets respecting string literals
    let depth = 0;
    let i = arrStart;
    let inStr = false;
    let strCh = '';
    let esc = false;
    for (; i < body.length; i++) {
      const ch = body[i];
      if (inStr) {
        if (esc) { esc = false; continue; }
        if (ch === '\\') { esc = true; continue; }
        if (ch === strCh) inStr = false;
        continue;
      }
      if (ch === '"' || ch === "'") { inStr = true; strCh = ch; continue; }
      if (ch === '[') depth++;
      else if (ch === ']') { depth--; if (depth === 0) { i++; break; } }
    }
    const arrJson = body.slice(arrStart, i);
    try {
      const parsed = JSON.parse(arrJson) as FFDay[];
      if (Array.isArray(parsed)) out.push(...parsed);
    } catch { /* skip malformed block */ }
  }
  return out;
}

async function fetchCalendar(): Promise<{ items: CalendarItem[]; error?: string; fetched_at: string }> {
  // FF supports week=this / week=next / week=last. Fetch this + next to give
  // the user a forward-looking view alongside what just happened.
  const urls = [
    'https://www.forexfactory.com/calendar?week=this',
    'https://www.forexfactory.com/calendar?week=next',
  ];

  const headers = {
    'User-Agent': 'Mozilla/5.0 (compatible; MCI-CRM/1.0)',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  try {
    const responses = await Promise.all(urls.map(u =>
      fetch(u, { headers, next: { revalidate: WEEK_SECONDS, tags: [TAG] } })
    ));

    const days: FFDay[] = [];
    for (const r of responses) {
      if (!r.ok) continue;
      const html = await r.text();
      days.push(...extractFFDays(html));
    }

    if (days.length === 0) {
      return { items: [], error: 'no data extracted from FF', fetched_at: new Date().toISOString() };
    }

    const seen = new Set<string>();
    const items: CalendarItem[] = [];
    for (const day of days) {
      const dayDate = dateFromDateline(day.dateline);
      for (const e of (day.events || [])) {
        if (e.country !== 'US') continue;
        // FF includes "holiday" or "non-economic" impacts that aren't releases
        const imp = (e.impactName || '').toLowerCase();
        if (imp === 'holiday' || imp === 'non-economic') continue;

        const id = e.id ? `ff-${e.id}` : `ff-${dayDate}-${e.name}`;
        if (seen.has(id)) continue;
        seen.add(id);

        items.push({
          id,
          name: e.name || 'Unknown release',
          release_date: dateFromDateline(e.dateline) || dayDate,
          release_time: fmtTimeFromLabel(e.timeLabel),
          previous_value: nullish(e.previous),
          consensus: nullish(e.forecast),
          actual_value: nullish(e.actual),
          importance: normalizeImpact(e.impactName),
          url: e.url ? `https://www.forexfactory.com${e.url}` : null,
        });
      }
    }

    items.sort((a, b) => a.release_date.localeCompare(b.release_date));
    return { items, fetched_at: new Date().toISOString() };
  } catch (err) {
    return {
      items: [],
      error: err instanceof Error ? err.message : 'fetch failed',
      fetched_at: new Date().toISOString(),
    };
  }
}

const cachedCalendar = unstable_cache(fetchCalendar, ['mci-calendar', 'us-ff'], {
  revalidate: WEEK_SECONDS,
  tags: [TAG],
});

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';
  if (force) revalidateTag(TAG);

  const result = await cachedCalendar();
  return NextResponse.json({ ...result, cache: force ? 'busted' : 'weekly' });
}
