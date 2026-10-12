// Sandpiper Daily Brief data (data/rates-brief.json). The "Morning Rates Brief" scheduled task
// rewrites that file every weekday with the same object it publishes to the hosted page
// (the JSON assigned to `const B = ` there). Keys and shape must stay as below; the
// CRM-only keys (bluf, top, econ, cal) are ignored by the hosted page.

export interface TapeRow {
  n: string;            // name, e.g. "S&P 500"
  v: string;            // level as displayed
  c: number | null;     // day change (sign drives color)
  ctext?: string | null;
  y: number | null;     // 1-year change (sign drives color)
  ytext?: string | null;
  why: string;
  rate?: boolean;       // rates and diesel: up = red. Otherwise up = green.
  asof?: string;
}

export interface KeyRate {
  n: string;            // SOFR, 2Y Treasury, ...
  cur: number | null;   // percent
  d1m: number | null;   // bp
  d6m: number | null;
  d1y: number | null;
  asof: string;
}

export interface FreightRow {
  n: string;
  v: string;
  pl: string;           // period label: Week, Month, ...
  pc: string | null;    // period change, as displayed
  y: string | null;     // 1Y change, as displayed
  why: string;
}

export interface SpotRow {
  n: string;            // company
  t: string;            // ticker
  p: number | null;     // close
  c: number | null;     // day %
  y: number | null;     // 1Y %
  u: string;            // one-sentence update
  asof?: string;
}

export interface NewsItem { tag: string; h: string; p: string; src: string; url?: string }
// "Top 5 today": key judgments, most important first.
export interface TopItem { tag?: string; h: string; p?: string; url?: string }
// Economy snapshot: one row per indicator.
export interface EconRow {
  n: string;            // indicator, e.g. "CPI, y/y"
  v: string;            // latest reading as displayed
  prior?: string | null;
  d?: string;           // period / release date of the latest reading, e.g. "Sep · Oct 15"
  why?: string;         // one-line read for an IOS investor
  dir?: 'up' | 'down' | 'flat' | null; // direction vs prior
  good?: boolean | null; // is that direction good for IOS (green) or bad (red)? null = neutral
}
// Week ahead: dated events. `d` is an ISO date (YYYY-MM-DD).
export interface CalItem { d: string; e: string; why?: string; tag?: string }
export interface BoardGroup { g: string; rows: { n: string; t: string; p: number; c: number | null; d: string }[] }
export interface SportsItem { lg: string; d: string; h: string; p: string; src?: string; url?: string }

// [ISO date, 2Y, 5Y, 10Y] — about 5 years of daily Treasury par yields.
export type SeriesRow = [string, number | null, number | null, number | null];

export interface RatesBrief {
  headline: string;
  dateline: string;
  ustDate: string;
  bluf?: string;        // bottom line up front: 2-3 sentences
  top?: TopItem[];
  econ?: EconRow[];
  cal?: CalItem[];
  tape: TapeRow[];
  key: KeyRate[];
  fhlb?: string;        // retired Oct 2026; no longer shown
  freight: FreightRow[];
  also: string;
  rota: { d: string; g: string; on?: boolean }[];
  spot: { g: string; rows: SpotRow[] };
  news: NewsItem[];
  foot: string;         // may contain simple HTML (<br>, <a>)
  board?: BoardGroup[];
  sports?: SportsItem[];
  series: SeriesRow[];
  rcols?: string[];
  rtab?: unknown[];
}

// "n/a", null, undefined and "" all mean "no value".
export const has = (v: unknown): boolean => v != null && v !== '' && v !== 'n/a';

// Each figure appears once: the 10Y lives in Rates & credit and diesel in Freight, so the
// markets strip leaves out tape rows that repeat a key rate or a freight measure.
export function marketRows(B: RatesBrief): TapeRow[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const keyTok = (B.key || []).map(k => k.n.split(' ')[0].toLowerCase());
  const freight = (B.freight || []).map(f => norm(f.n));
  return (B.tape || []).filter(t => {
    const first = t.n.split(' ')[0].toLowerCase();
    if (keyTok.includes(first) && /treasury|sofr/i.test(t.n)) return false;
    if (freight.includes(norm(t.n))) return false;
    return true;
  });
}

// Your own dates from the CRM, merged into the week ahead.
export interface DealDate { d: string; e: string; why?: string; tag: string }

// Key rates with their levels 1M / 6M / 1Y ago, from the brief's rate table when present.
export function rateLevels(B: RatesBrief, k: KeyRate): (string | null)[] {
  const rtab = (B.rtab || []) as { n?: string; v?: string[] }[];
  const tok = k.n.split(' ')[0];
  const row = rtab.find(r => r.n && r.v && r.n.split(' ')[0] === tok);
  return row?.v ? [0, 1, 2, 3].map(i => row.v?.[i] ?? null) : [k.cur != null ? k.cur.toFixed(2) : null, null, null, null];
}

// The brief's text fields carry a little trusted markup (bold, line breaks, links).
// Keep only those tags so nothing else can render.
export function safeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/<(?!\/?(b|strong|i|em|br)\b)(?!a\s+href="https?:\/\/[^"]*"[^>]*>)(?!\/a>)[^>]*>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/<a\s+href="(https?:\/\/[^"]*)"[^>]*>/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">');
}
