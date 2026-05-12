import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';

// Fetches the US economic calendar from the FairEconomy XML feed that powers
// Forex Factory's calendar. Direct scraping of forexfactory.com fails from
// server-side (Cloudflare blocks plain UAs with a JS challenge), but their
// CDN-hosted XML feed at nfs.faireconomy.media is open and structured.
//
// Feed shape (1 file = this week):
//   <weeklyevents>
//     <event>
//       <title>...</title>
//       <country>USD</country>
//       <date>05-11-2026</date>       <!-- MM-DD-YYYY -->
//       <time>8:30am</time>           <!-- "All Day" / "Tentative" possible -->
//       <impact>High</impact>         <!-- Low | Medium | High | Holiday -->
//       <forecast>0.3%</forecast>
//       <previous>0.2%</previous>
//       <actual>0.4%</actual>         <!-- only after release -->
//       <url>https://...</url>
//     </event>
//     ...
//
// Caching: weekly via unstable_cache + tag. ?force=1 calls revalidateTag.
// The feed is rate-limited per IP — keeping the weekly cache prevents us
// from ever exceeding their threshold under normal use.

export const dynamic = 'force-dynamic';
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const TAG = 'macro-calendar';
const FEED_URL = 'https://nfs.faireconomy.media/ff_calendar_thisweek.xml';

export interface CalendarItem {
  id: string;
  name: string;
  release_date: string;             // ISO date (YYYY-MM-DD)
  release_time: string | null;
  previous_value: string | null;
  consensus: string | null;
  actual_value: string | null;
  importance: 'low' | 'medium' | 'high';
  url: string | null;
}

function cdataOr(s: string | undefined | null): string | null {
  if (s == null) return null;
  const t = s.replace(/^\s*<!\[CDATA\[\s*/, '').replace(/\s*\]\]>\s*$/, '').trim();
  return t ? t : null;
}

function fieldOf(block: string, name: string): string | null {
  const m = block.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? cdataOr(m[1]) : null;
}

function importanceFromFF(s: string | null): 'low' | 'medium' | 'high' {
  const v = (s || '').toLowerCase();
  if (v === 'high') return 'high';
  if (v === 'low') return 'low';
  return 'medium';
}

// "05-11-2026" → "2026-05-11". Returns "" on bad input.
function ymdFromMDY(mdy: string | null): string {
  if (!mdy) return '';
  const m = mdy.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : '';
}

function fmtTime(timeRaw: string | null): string | null {
  if (!timeRaw) return null;
  const t = timeRaw.trim();
  if (!t || /^all\s*day$/i.test(t) || /^tentative$/i.test(t)) return t || null;
  // "8:30am" → "8:30 AM ET"
  const m = t.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!m) return `${t} ET`;
  return `${m[1]}:${m[2]} ${m[3].toUpperCase()} ET`;
}

async function fetchCalendar(): Promise<{ items: CalendarItem[]; error?: string; fetched_at: string }> {
  try {
    const res = await fetch(FEED_URL, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MCI-CRM/1.0)',
        'Accept': 'application/xml,text/xml,*/*',
      },
      next: { revalidate: WEEK_SECONDS, tags: [TAG] },
    });

    if (!res.ok) {
      return { items: [], error: `feed ${res.status}`, fetched_at: new Date().toISOString() };
    }
    const xml = await res.text();
    // Rate-limited responses come back as HTML with a "Rate Limited" title.
    if (!xml.includes('<event>') && /Rate Limited/i.test(xml)) {
      return { items: [], error: 'feed rate-limited', fetched_at: new Date().toISOString() };
    }

    const items: CalendarItem[] = [];
    const seen = new Set<string>();
    const eventRe = /<event>([\s\S]*?)<\/event>/g;
    let m: RegExpExecArray | null;
    let idx = 0;
    while ((m = eventRe.exec(xml)) !== null) {
      const blk = m[1];
      const country = fieldOf(blk, 'country');
      if (country !== 'USD') continue;

      const impactRaw = fieldOf(blk, 'impact');
      // Skip non-economic items the feed marks as Holiday.
      if (impactRaw && /^holiday$/i.test(impactRaw)) continue;

      const release_date = ymdFromMDY(fieldOf(blk, 'date'));
      if (!release_date) continue;

      const name = fieldOf(blk, 'title') || 'Unknown release';
      const url = fieldOf(blk, 'url');
      const key = `${release_date}|${name}|${fieldOf(blk, 'time') || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);

      items.push({
        id: `ff-${idx++}`,
        name,
        release_date,
        release_time: fmtTime(fieldOf(blk, 'time')),
        previous_value: fieldOf(blk, 'previous'),
        consensus: fieldOf(blk, 'forecast'),
        actual_value: fieldOf(blk, 'actual'),
        importance: importanceFromFF(impactRaw),
        url: url || null,
      });
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

const cachedCalendar = unstable_cache(fetchCalendar, ['mci-calendar', 'us-fairecon'], {
  revalidate: WEEK_SECONDS,
  tags: [TAG],
});

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';
  if (force) revalidateTag(TAG);

  const result = await cachedCalendar();
  return NextResponse.json({ ...result, cache: force ? 'busted' : 'weekly' });
}
