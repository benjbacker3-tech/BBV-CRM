import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { summarizeForIOS, getLastClaudeError, isClaudeConfigured } from '@/lib/claude';

// Aggregates macro research from 3 sources with weekly caching and AI summaries.
//
// Sources:
//   - LMI: scrape the-lmi.com homepage (best-effort regex)
//   - Howard Marks (Oaktree): scrape memos listing (best-effort regex)
//   - Eye on the Market (JP Morgan AM institutional): scrape index page (best-effort)
//
// Caching strategy:
//   - Each source is fetched + Claude-summarized once a week
//   - Result cached by source name via unstable_cache (tag: 'macro-research')
//   - On ?force=1, revalidateTag('macro-research') busts everything
//
// All external fetches are also cached at the Next fetch layer with the same
// weekly TTL and tag, so even within a refresh cycle we don't re-hit
// Oaktree / LMI / JPM multiple times.

export const dynamic = 'force-dynamic';
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const TAG = 'macro-research';

export interface ResearchItem {
  source: string;
  title: string;
  published: string;
  themes: string;
  url: string;
  fetched_at: string;
  ai: boolean;       // true if themes were Claude-generated, false for placeholder/excerpt
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MCI-CRM/1.0)' };

function clean(s: string): string {
  return s.replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'").replace(/&#x27;/g, "'").replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ').trim();
}

function cdataOr(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[\s*/, '').replace(/\s*\]\]>\s*$/, '').trim();
}

// ─── LMI (scrape press release page) ─────────────────────────────────────────
const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

async function fetchLMI(): Promise<ResearchItem | null> {
  try {
    // Step 1: fetch the homepage and find the most-recent report. The page
    // embeds a JSON-ish nav list of every report: {"title":"...","url":"..."}
    // We match all "Month YYYY Logistics Manager..." entries with their
    // accompanying url and pick the highest (year, month).
    const homeRes = await fetch('https://www.the-lmi.com/', {
      headers: UA,
      next: { revalidate: WEEK_SECONDS, tags: [TAG] },
    });
    if (!homeRes.ok) return null;
    const homeHtml = await homeRes.text();

    const entryRe = /"title":"((January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})[^"]*Logistics Manager[^"]*)","url":"([^"]+\.html)"/gi;
    let best: { ord: number; title: string; month: string; year: string; href: string } | null = null;
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(homeHtml)) !== null) {
      const month = m[2];
      const year = m[3];
      const mi = MONTHS.indexOf(month.toLowerCase());
      if (mi < 0) continue;
      const ord = Number(year) * 12 + mi;
      if (!best || ord > best.ord) {
        best = { ord, title: m[1], month, year, href: m[4] };
      }
    }

    // Fallback: if the JSON-ish nav isn't found, scan freeform titles on the
    // homepage and link to the homepage itself.
    if (!best) {
      const titleRe = /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})[^"<>]{0,80}Logistics Manager[^"<>]{0,160}/gi;
      let m2: RegExpExecArray | null;
      while ((m2 = titleRe.exec(homeHtml)) !== null) {
        const month = m2[1];
        const year = m2[2];
        const mi = MONTHS.indexOf(month.toLowerCase());
        if (mi < 0) continue;
        const ord = Number(year) * 12 + mi;
        if (!best || ord > best.ord) {
          best = { ord, title: m2[0], month, year, href: '' };
        }
      }
    }

    const reportUrl = best?.href
      ? (best.href.startsWith('http') ? best.href : `https://www.the-lmi.com/${best.href.replace(/^\//, '')}`)
      : 'https://www.the-lmi.com/';

    // Step 2: fetch the actual report page so Claude can summarize its
    // commentary instead of the homepage archive list. The report page is
    // the same Weebly template so it includes the full archive nav in the
    // header AND footer — slice out the middle to isolate body content.
    let themes: string | null = null;
    if (best?.href) {
      try {
        const reportRes = await fetch(reportUrl, { headers: UA, next: { revalidate: WEEK_SECONDS, tags: [TAG] } });
        if (reportRes.ok) {
          const reportHtml = await reportRes.text();
          const stripped = reportHtml
            .replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '');
          let text = clean(stripped);
          // The Weebly nav menu lists every prior report. Drop the header nav
          // by finding the first paragraph-style content after position 2500
          // (everything before tends to be nav links). Trim the trailing nav
          // by lopping the last 4000 chars where the footer nav lives.
          if (text.length > 8000) {
            text = text.slice(2500, Math.max(2500, text.length - 4000));
          }
          if (text.length > 200) {
            themes = await summarizeForIOS(text, 'LMI Report');
          }
        }
      } catch { /* fall through to homepage-based summary */ }
    }

    // Last-ditch: if the report fetch failed, summarize what we have on the
    // homepage near the latest-report mention.
    if (!themes) {
      const stripped = homeHtml
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '');
      let body = clean(stripped);
      if (best) {
        const idx = body.toLowerCase().indexOf(`${best.month.toLowerCase()} ${best.year}`);
        if (idx > 0) body = body.slice(Math.max(0, idx - 500), idx + 6000);
      } else {
        body = body.slice(0, 6000);
      }
      if (body.length > 200) themes = await summarizeForIOS(body, 'LMI Report');
    }

    return {
      source: 'LMI Report',
      title: best ? clean(best.title).slice(0, 200) : 'Latest LMI release',
      published: best ? `${best.month} ${best.year}` : '',
      themes: themes || 'Open the latest LMI report at the link.',
      url: reportUrl,
      fetched_at: new Date().toISOString(),
      ai: !!themes,
    };
  } catch {
    return null;
  }
}

// ─── Howard Marks (Oaktree memos listing) ────────────────────────────────────
async function fetchHowardMarks(): Promise<ResearchItem | null> {
  try {
    // Step 1: get the memos listing
    const listRes = await fetch('https://www.oaktreecapital.com/insights/memos', {
      headers: UA,
      next: { revalidate: WEEK_SECONDS, tags: [TAG] },
    });
    if (!listRes.ok) return null;
    const listHtml = await listRes.text();

    const memoMatch = listHtml.match(/href="(\/insights\/memos\/[^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/);
    let title = '';
    let url = 'https://www.oaktreecapital.com/insights/memos';
    if (memoMatch) {
      url = 'https://www.oaktreecapital.com' + memoMatch[1];
      title = clean(memoMatch[2]).slice(0, 200);
    }
    const dateMatch = listHtml.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/);
    const published = dateMatch ? dateMatch[0] : '';

    // Step 2: fetch the memo content for Claude
    let themes: string | null = null;
    if (url !== 'https://www.oaktreecapital.com/insights/memos') {
      try {
        const memoRes = await fetch(url, { headers: UA, next: { revalidate: WEEK_SECONDS, tags: [TAG] } });
        if (memoRes.ok) {
          const memoHtml = await memoRes.text();
          const body = clean(memoHtml.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, ''));
          if (body.length > 200) themes = await summarizeForIOS(body, 'Howard Marks Memo');
        }
      } catch { /* fall through */ }
    }

    return {
      source: 'Howard Marks Memo',
      title: title || 'Latest memo on Oaktree Insights',
      published,
      themes: themes || (title ? 'Read at Oaktree.' : 'No memo found.'),
      url,
      fetched_at: new Date().toISOString(),
      ai: !!themes,
    };
  } catch {
    return null;
  }
}

// ─── Eye on the Market (JP Morgan AM) ────────────────────────────────────────
async function fetchEOTM(): Promise<ResearchItem | null> {
  try {
    const res = await fetch('https://am.jpmorgan.com/us/en/asset-management/institutional/insights/market-insights/eye-on-the-market/', {
      headers: UA,
      next: { revalidate: WEEK_SECONDS, tags: [TAG] },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const headline = titleMatch
      ? clean(titleMatch[1]).replace(/\s*[\|·\-—]\s*J\.?P\.?\s*Morgan.*$/i, '').slice(0, 200)
      : '';
    const dateMatch = html.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/);
    const published = dateMatch ? dateMatch[0] : '';

    const body = clean(html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')).slice(0, 6000);
    const themes = body.length > 200 ? await summarizeForIOS(body, 'Eye on the Market') : null;

    return {
      source: 'Eye on the Market',
      title: headline || 'Latest Eye on the Market — Cembalest',
      published,
      themes: themes || 'Visit JP Morgan to read the latest piece.',
      url: 'https://am.jpmorgan.com/us/en/asset-management/institutional/insights/market-insights/eye-on-the-market/',
      fetched_at: new Date().toISOString(),
      ai: !!themes,
    };
  } catch {
    return null;
  }
}

// Wrap each source's full fetch + Claude pipeline in unstable_cache keyed by
// source name. Result is cached for a week and invalidated by revalidateTag.
const cachedLMI         = unstable_cache(fetchLMI,         ['mci-research', 'lmi'],  { revalidate: WEEK_SECONDS, tags: [TAG] });
const cachedHowardMarks = unstable_cache(fetchHowardMarks, ['mci-research', 'hm'],   { revalidate: WEEK_SECONDS, tags: [TAG] });
const cachedEOTM        = unstable_cache(fetchEOTM,        ['mci-research', 'eotm'], { revalidate: WEEK_SECONDS, tags: [TAG] });

function placeholder(source: string, url: string): ResearchItem {
  return {
    source,
    title: 'Auto-fetch unavailable — click link',
    published: '',
    themes: 'The source page changed format or is gated. Visit it directly for the latest content.',
    url,
    fetched_at: new Date().toISOString(),
    ai: false,
  };
}

export async function GET(req: NextRequest) {
  const force = req.nextUrl.searchParams.get('force') === '1';
  if (force) revalidateTag(TAG);

  const [lmi, hm, eotm] = await Promise.all([
    cachedLMI(),
    cachedHowardMarks(),
    cachedEOTM(),
  ]);

  const items: ResearchItem[] = [
    lmi  || placeholder('LMI Report',         'https://www.the-lmi.com/'),
    hm   || placeholder('Howard Marks Memo',  'https://www.oaktreecapital.com/insights/memos'),
    eotm || placeholder('Eye on the Market',  'https://am.jpmorgan.com/us/en/asset-management/institutional/insights/market-insights/eye-on-the-market/'),
  ];

  return NextResponse.json({
    items,
    fetched_at: new Date().toISOString(),
    ai_enabled: isClaudeConfigured(),
    ai_last_error: getLastClaudeError(),  // null when the most recent call succeeded
    cache: force ? 'busted' : 'weekly',
  });
}
