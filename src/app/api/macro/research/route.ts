import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache, revalidateTag } from 'next/cache';
import { summarizeForIOS } from '@/lib/claude';

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
async function fetchLMI(): Promise<ResearchItem | null> {
  try {
    const res = await fetch('https://www.the-lmi.com/', {
      headers: UA,
      next: { revalidate: WEEK_SECONDS, tags: [TAG] },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const titleMatch = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})[^<>]{0,80}Logistics Manager[^<>]{0,160}/i);
    const title = titleMatch ? clean(titleMatch[0]).slice(0, 200) : '';
    const published = titleMatch ? `${titleMatch[1]} ${titleMatch[2]}` : '';

    // For Claude context: extract the main content block (strip nav/footer/scripts)
    const cleanedHtml = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '');
    const body = clean(cleanedHtml).slice(0, 6000);
    const themes = body ? await summarizeForIOS(body, 'LMI Report') : null;

    return {
      source: 'LMI Report',
      title: title || 'Latest LMI release',
      published,
      themes: themes || 'Open the LMI homepage for the latest reading.',
      url: 'https://www.the-lmi.com/',
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
    ai_enabled: !!process.env.ANTHROPIC_API_KEY,
    cache: force ? 'busted' : 'weekly',
  });
}
