// Sandpiper Daily Brief data (data/rates-brief.json). The "Morning Rates Brief" scheduled task
// rewrites that file every weekday with the same object it publishes to the hosted page
// (the JSON assigned to `const B = ` there). Keys and shape must stay as below; the
// CRM-only keys (top, econ, cal) are ignored by the hosted page.

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
// "Top 5 today": key judgments, most important first. Retired Oct 14, 2026 for `rundown`.
export interface TopItem { tag?: string; h: string; p?: string; url?: string }
// "The Rundown": 5–7 newsletter-style items, most important first. `h` is a bold lead-in,
// `p` two or three sentences of context and the so-what. Replaces Top 5 and What's moving.
export interface RundownItem { tag?: string; h: string; p: string; url?: string; src?: string }
// The daily deep dive: one structural topic or trend, chosen each day for a broad investor.
export interface DeepDive {
  kicker?: string;      // topic label, e.g. "Private credit"
  title: string;
  dek?: string;         // one-sentence summary under the title
  body: string[];       // paragraphs; may carry simple markup (<b>, <i>, <a>)
  table?: { cap?: string; cols: string[]; rows: string[][] };
  watch?: string[];     // what to watch next, short lines
  src?: string;         // sources, one line
}
// Standing readings that aren't weekly releases (Fed funds target, mortgage rate, ...),
// shown as one compact line under Rates & credit. `why` is optional.
export interface EconRow {
  n: string;            // indicator, e.g. "CPI, y/y"
  v: string;            // latest reading as displayed
  prior?: string | null;
  d?: string;           // period / release date of the latest reading, e.g. "Sep · Oct 15"
  why?: string;         // one-line read for an IOS investor
  dir?: 'up' | 'down' | 'flat' | null; // direction vs prior
  good?: boolean | null; // is that direction good for IOS (green) or bad (red)? null = neutral
}
// Economic calendar: dated releases and events. `d` is an ISO date (YYYY-MM-DD).
// Released items carry `act` (actual) next to `cons` (consensus) and `prior`;
// upcoming items carry `cons` and `prior`. `good` colors the actual for an IOS
// investor (true = good, false = bad, null = neutral).
export interface CalItem {
  d: string; e: string; why?: string; tag?: string;
  act?: string | null; cons?: string | null; prior?: string | null; good?: boolean | null;
}
export interface BoardGroup { g: string; rows: { n: string; t: string; p: number; c: number | null; d: string }[] }
export interface SportsItem { lg: string; d: string; h: string; p: string; src?: string; url?: string }

// [ISO date, 2Y, 5Y, 10Y] — about 5 years of daily Treasury par yields.
export type SeriesRow = [string, number | null, number | null, number | null];

// Page 3, "Investor's Corner": a well-known investor's ideas, story or writing, half to a full
// page. Written in the brief's own words; at most one short quote, attributed.
export interface Reading {
  kind: string;         // Bio, Story, Thoughts or Reading
  who: string;          // e.g. "Howard Marks"
  title: string;
  dek?: string;
  body: string[];       // paragraphs; may carry simple markup
  quote?: { text: string; src: string };
  takeaways?: string[]; // what it means for an investor today, short lines
  src?: string;         // where to read more
}

export interface RatesBrief {
  headline: string;
  dateline: string;
  ustDate: string;
  bluf?: string;        // retired Oct 2026; no longer shown
  top?: TopItem[];      // retired Oct 14, 2026; shown only when `rundown` is missing
  rundown?: RundownItem[];
  dive?: DeepDive;
  reading?: Reading;    // page 3
  econ?: EconRow[];
  cal?: CalItem[];
  tape: TapeRow[];      // markets: S&P 500, Dow, Nasdaq, oil, dollar (+10Y and diesel, shown elsewhere)
  key: KeyRate[];
  fhlb?: string;        // retired Oct 2026; no longer shown
  freight: FreightRow[];
  also: string;
  rota?: { d: string; g: string; on?: boolean }[];  // retired Oct 14, 2026 (stock spotlight)
  spot?: { g: string; rows: SpotRow[] };            // retired Oct 14, 2026
  news?: NewsItem[];    // retired Oct 14, 2026; folded into `rundown`
  foot: string;         // may contain simple HTML (<br>, <a>); not shown in the CRM
  board?: BoardGroup[];
  sports?: SportsItem[];
  sport?: string;       // one line of sports, shown last
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

// The routine writes this file unattended, so list fields are read defensively: a string
// becomes paragraphs (split on blank lines), anything else that isn't a list becomes [].
// One malformed field must never fail the build.
export function list<T = string>(v: unknown): T[] {
  if (Array.isArray(v)) return v.filter(x => x != null && x !== '') as T[];
  if (typeof v === 'string' && v.trim()) return v.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean) as T[];
  return [];
}

// The Rundown, falling back to an older file's Top 5.
export function rundownOf(B: RatesBrief): RundownItem[] {
  const r = list<RundownItem>(B.rundown).filter(x => typeof x === 'object' && x.h);
  if (r.length) return r;
  return list<TopItem>(B.top).map(t => ({ tag: t.tag, h: t.h, p: t.p || '', url: t.url }));
}

// The sports line, falling back to the older multi-item sports list.
export function sportOf(B: RatesBrief): string {
  if (has(B.sport)) return B.sport as string;
  return (B.sports || []).map(s => `${s.lg}: ${s.h}`).join(' · ');
}

// Splits the calendar around today: released last week, due this week, and later.
export function splitCalendar(cal: CalItem[] | undefined, now = new Date()) {
  const day = (offset: number) => { const d = new Date(now); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const today = day(0), weekAgo = day(-8), weekOut = day(7), later = day(21);
  const items = [...(cal || [])].filter(i => i.d).sort((a, b) => a.d.localeCompare(b.d));
  return {
    last: items.filter(i => i.d < today && i.d >= weekAgo),
    next: items.filter(i => i.d >= today && i.d <= weekOut),
    later: items.filter(i => i.d > weekOut && i.d <= later),
  };
}


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
