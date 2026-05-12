import { NextResponse } from 'next/server';

// Aggregates the latest macro research from 4 sources.
// - Calculated Risk: native RSS (reliable)
// - LMI: scrape the-lmi.com homepage (best-effort)
// - Howard Marks / Oaktree: scrape oaktreecapital.com/insights/memos (best-effort)
// - Eye on the Market: scrape am.jpmorgan.com EOTM (best-effort)
//
// Each source returns gracefully (null/empty) if its parsing fails so the
// rest still surface. Results are cached for 1 hour via Next fetch revalidate.

export const dynamic = 'force-dynamic';
// 1-hour cache — these sources don't change often
const REVALIDATE = 3600;

export interface ResearchItem {
  source: string;
  title: string;
  published: string;       // ISO date or human "Apr 2026"
  themes: string;          // excerpt / summary
  url: string;
  fetched_at: string;
}

const UA = { 'User-Agent': 'Mozilla/5.0 (compatible; MCI-CRM/1.0; +https://bbv-crm.vercel.app)' };

// Strip HTML tags and decode common entities
function clean(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

function cdataOr(s: string): string {
  return s.replace(/^\s*<!\[CDATA\[\s*/, '').replace(/\s*\]\]>\s*$/, '').trim();
}

// ─── Calculated Risk (RSS) ──────────────────────────────────────────────────
async function fetchCalculatedRisk(): Promise<ResearchItem[]> {
  try {
    const res = await fetch('https://www.calculatedriskblog.com/feeds/posts/default?alt=rss', {
      headers: UA,
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items: ResearchItem[] = [];
    const matches = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g));
    for (const m of matches) {
      const itemXml = m[1];
      const rawTitle = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1] || '';
      const rawDesc = itemXml.match(/<description>([\s\S]*?)<\/description>/)?.[1] || '';
      const link = itemXml.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || '';
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || '';
      const title = clean(cdataOr(rawTitle));
      const desc = clean(cdataOr(rawDesc));
      if (!title || !link) continue;
      items.push({
        source: 'Calculated Risk',
        title,
        published: pubDate ? new Date(pubDate).toISOString().split('T')[0] : '',
        themes: desc.slice(0, 320),
        url: link,
        fetched_at: new Date().toISOString(),
      });
      if (items.length >= 3) break;
    }
    return items;
  } catch {
    return [];
  }
}

// ─── LMI (scrape press release page) ─────────────────────────────────────────
async function fetchLMI(): Promise<ResearchItem | null> {
  try {
    const res = await fetch('https://www.the-lmi.com/', { headers: UA, next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    const html = await res.text();
    // The LMI site has headlines like "April 2026 Logistics Manager's Index Report: 58.4"
    // Look for "<MONTH> <YEAR>" near "Logistics Manager"
    const titleMatch = html.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})[^<>]{0,80}Logistics Manager[^<>]{0,160}/i);
    let title = '';
    let published = '';
    if (titleMatch) {
      title = clean(titleMatch[0]).slice(0, 200);
      published = `${titleMatch[1]} ${titleMatch[2]}`;
    }
    // Try to find the headline reading "XX.X" near "Index"
    const valueMatch = html.match(/Index[^<>]{0,40}\b(\d{2}\.\d)/);
    const headline = valueMatch ? `Headline LMI: ${valueMatch[1]}` : '';
    return {
      source: 'LMI Report',
      title: title || 'Latest LMI release',
      published,
      themes: headline || 'Open the LMI homepage for the latest reading and commentary.',
      url: 'https://www.the-lmi.com/',
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ─── Howard Marks (scrape Oaktree memos listing) ─────────────────────────────
async function fetchHowardMarks(): Promise<ResearchItem | null> {
  try {
    const res = await fetch('https://www.oaktreecapital.com/insights/memos', { headers: UA, next: { revalidate: REVALIDATE } });
    if (!res.ok) return null;
    const html = await res.text();
    // Memos are usually listed with titles + dates. Try to find the first <h2/h3> + a date pattern
    // Look for patterns like 'href="/insights/memos/<slug>"' with nearby text
    const memoMatch = html.match(/href="(\/insights\/memos\/[^"]+)"[^>]*>\s*([^<]+?)\s*<\/a>/);
    let title = '';
    let url = 'https://www.oaktreecapital.com/insights/memos';
    if (memoMatch) {
      url = 'https://www.oaktreecapital.com' + memoMatch[1];
      title = clean(memoMatch[2]).slice(0, 200);
    }
    // Try to find a date near the title
    const dateMatch = html.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/);
    const published = dateMatch ? dateMatch[0] : '';
    return {
      source: 'Howard Marks Memo',
      title: title || 'Latest memo on Oaktree Insights',
      published,
      themes: title ? `Latest memo from Howard Marks — read at Oaktree.` : '',
      url,
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

// ─── Eye on the Market (scrape JP Morgan Asset Mgmt) ─────────────────────────
async function fetchEOTM(): Promise<ResearchItem | null> {
  try {
    const res = await fetch('https://am.jpmorgan.com/us/en/asset-management/adv/insights/market-insights/eye-on-the-market/', {
      headers: UA,
      next: { revalidate: REVALIDATE },
    });
    if (!res.ok) return null;
    const html = await res.text();
    // Find first article link / title — JP Morgan pages vary; use generic heuristics
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const headline = titleMatch ? clean(titleMatch[1]).replace(/\s*[\|·\-—]\s*J\.?P\.?\s*Morgan.*$/i, '').slice(0, 200) : '';
    const dateMatch = html.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s+20\d{2}\b/);
    const published = dateMatch ? dateMatch[0] : '';
    return {
      source: 'Eye on the Market',
      title: headline || 'Latest Eye on the Market — Michael Cembalest',
      published,
      themes: 'Visit JP Morgan to read the latest piece.',
      url: 'https://am.jpmorgan.com/us/en/asset-management/adv/insights/market-insights/eye-on-the-market/',
      fetched_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  const [cr, lmi, hm, eotm] = await Promise.all([
    fetchCalculatedRisk(),
    fetchLMI(),
    fetchHowardMarks(),
    fetchEOTM(),
  ]);

  // Return one row per source — auto-fetched. User can still override in the
  // market_snapshot research entries (manual takes precedence in the UI).
  const items: ResearchItem[] = [
    lmi || placeholder('LMI Report', 'https://www.the-lmi.com/'),
    hm || placeholder('Howard Marks Memo', 'https://www.oaktreecapital.com/insights/memos'),
    eotm || placeholder('Eye on the Market', 'https://am.jpmorgan.com/us/en/asset-management/adv/insights/market-insights/eye-on-the-market/'),
    cr[0] || placeholder('Calculated Risk', 'https://www.calculatedriskblog.com/'),
  ];

  return NextResponse.json({
    items,
    additional_calc_risk: cr.slice(1, 3),  // 2 more recent CR posts
    fetched_at: new Date().toISOString(),
  });
}

function placeholder(source: string, url: string): ResearchItem {
  return {
    source,
    title: 'Auto-fetch unavailable — click link',
    published: '',
    themes: 'The source page changed format or is gated. Visit it directly for the latest content.',
    url,
    fetched_at: new Date().toISOString(),
  };
}
