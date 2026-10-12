// Morning Rates Brief data (data/rates-brief.json). The "Morning Rates Brief" scheduled task
// rewrites that file every weekday with the same object it publishes to the hosted page
// (the JSON assigned to `const B = ` there). Keys and shape must stay as below.

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
export interface BoardGroup { g: string; rows: { n: string; t: string; p: number; c: number | null; d: string }[] }
export interface SportsItem { lg: string; d: string; h: string; p: string; src?: string; url?: string }

// [ISO date, 2Y, 5Y, 10Y] — about 5 years of daily Treasury par yields.
export type SeriesRow = [string, number | null, number | null, number | null];

export interface RatesBrief {
  headline: string;
  dateline: string;
  ustDate: string;
  tape: TapeRow[];
  key: KeyRate[];
  fhlb: string;         // may contain simple HTML (<b>, <br>)
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

// The brief's text fields carry a little trusted markup (bold, line breaks, links).
// Keep only those tags so nothing else can render.
export function safeHtml(s: string | null | undefined): string {
  if (!s) return '';
  return s
    .replace(/<(?!\/?(b|strong|i|em|br)\b)(?!a\s+href="https?:\/\/[^"]*"[^>]*>)(?!\/a>)[^>]*>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/<a\s+href="(https?:\/\/[^"]*)"[^>]*>/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">');
}
