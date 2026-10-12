// Geometry for the 2Y / 5Y / 10Y Treasury chart, shared by the Rates Brief tab and its
// printout. Pure: give it the series, a range and a size; it returns what to draw.
import type { SeriesRow } from './rates-brief';

export const RANGES = {
  '2w': { days: 14, label: '2 weeks' },
  '6m': { months: 6, label: '6 months' },
  '1y': { months: 12, label: 'year' },
  '5y': { months: 60, label: '5 years' },
} as const;
export type Range = keyof typeof RANGES;

// Series styling: 10Y darkest. Light / dark-mode classes, plus `hex` for print. `k` = index into a series row.
export const LINES = [
  { k: 3, name: '10-year', short: '10Y', hex: '#1E3A5F', stroke: 'stroke-[#1E3A5F] dark:stroke-[#E2EBF7]', fill: 'fill-[#1E3A5F] dark:fill-[#E2EBF7]', w: 2.2 },
  { k: 2, name: '5-year', short: '5Y', hex: '#4F80BD', stroke: 'stroke-[#4F80BD] dark:stroke-[#6FA0DB]', fill: 'fill-[#4F80BD] dark:fill-[#6FA0DB]', w: 1.8 },
  { k: 1, name: '2-year', short: '2Y', hex: '#9DB8D9', stroke: 'stroke-[#9DB8D9] dark:stroke-[#3F6591]', fill: 'fill-slate-500 dark:fill-[#6FA0DB]', w: 1.8 },
] as const;
export type Line = (typeof LINES)[number];

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MINUS = '−';
export const bp = (x: number) => (x > 0 ? `+${x}` : x < 0 ? `${MINUS}${Math.abs(x)}` : '0');

export interface Pt { d: Date; v: [number | null, number | null, number | null, number | null] }

export function toPoints(series: SeriesRow[]): Pt[] {
  return series
    .filter(r => r && r[0])
    .map(r => ({ d: new Date(r[0] + 'T12:00:00'), v: [null, r[1], r[2], r[3]] as Pt['v'] }))
    .sort((a, b) => a.d.getTime() - b.d.getTime());
}

export function inRange(all: Pt[], range: Range): Pt[] {
  if (!all.length) return [];
  const end = all[all.length - 1].d;
  const start = new Date(end);
  const R = RANGES[range];
  if ('days' in R) start.setDate(start.getDate() - R.days); else start.setMonth(start.getMonth() - R.months);
  return all.filter(p => p.d >= start);
}

export interface ChartModel {
  W: number; H: number;
  m: { l: number; r: number; t: number; b: number };
  x: (d: Date) => number;
  y: (v: number) => number;
  grid: number[];                                  // y gridline values, low to high
  ticks: { x: number; label: string }[];
  paths: { s: Line; segs: string[] }[];            // polyline point strings; a null breaks a line
  ends: { s: Line; x: number; y: number; ly: number; v: number }[];
  moves: string;                                   // "2Y +120bp · 5Y +128bp · 10Y +110bp"
}

export function chartModel(D: Pt[], range: Range, W: number, H: number, narrow: boolean): ChartModel | null {
  if (D.length < 2) return null;
  const m = { l: 4, r: narrow ? 92 : 112, t: 18, b: 26 };
  let lo = Infinity, hi = -Infinity;
  D.forEach(p => LINES.forEach(s => { const v = p.v[s.k]; if (v != null) { lo = Math.min(lo, v); hi = Math.max(hi, v); } }));
  if (!isFinite(lo)) return null;
  const span = hi - lo;
  const step = span > 3 ? 1 : span > 1 ? 0.5 : span > 0.4 ? 0.25 : 0.1;
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step; if (hi - lo < step * 2) hi += step;
  const t0 = D[0].d.getTime(), t1 = D[D.length - 1].d.getTime();
  const x = (d: Date) => m.l + ((d.getTime() - t0) / (t1 - t0)) * (W - m.l - m.r);
  const y = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);

  const grid: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) grid.push(+v.toFixed(4));

  const ticks: { x: number; label: string }[] = [];
  if (range === '2w') {
    D.forEach((p, i) => { const j = D.length - 1 - i; if (i > 0 && j % (narrow ? 3 : 2) === 0) ticks.push({ x: x(p.d), label: `${MON[p.d.getMonth()]} ${p.d.getDate()}` }); });
  } else if (range === '5y') {
    let ly = -1; D.forEach(p => { const yr = p.d.getFullYear(); if (yr !== ly) { if (ly !== -1) ticks.push({ x: x(p.d), label: String(yr) }); ly = yr; } });
  } else {
    let last = -1; const every = range === '1y' ? (narrow ? 3 : 2) : 1;
    D.forEach(p => { const mo = p.d.getMonth(); if (mo !== last) { if (last !== -1 && mo % every === 0) ticks.push({ x: x(p.d), label: MON[mo] + (mo === 0 ? ` '${String(p.d.getFullYear()).slice(2)}` : '') }); last = mo; } });
  }

  const paths = LINES.map(s => {
    const segs: string[][] = [[]];
    D.forEach(p => { const v = p.v[s.k]; if (v == null) { if (segs[segs.length - 1].length) segs.push([]); } else segs[segs.length - 1].push(`${x(p.d).toFixed(1)},${y(v).toFixed(1)}`); });
    return { s, segs: segs.filter(g => g.length > 1).map(g => g.join(' ')) };
  });

  const lastWith = (k: number) => [...D].reverse().find(p => p.v[k] != null);
  const ends = LINES.map(s => { const p = lastWith(s.k); return p ? { s, x: x(p.d), y: y(p.v[s.k] as number), v: p.v[s.k] as number, ly: 0 } : null })
    .filter((e): e is NonNullable<typeof e> => !!e)
    .sort((a, b) => a.y - b.y);
  ends.forEach((e, i) => { e.ly = i > 0 && e.y - ends[i - 1].ly < 15 ? ends[i - 1].ly + 15 : e.y; });

  const first = D[0], last = D[D.length - 1];
  const moves = LINES.slice().reverse().map(s => {
    const a = first.v[s.k], b = last.v[s.k];
    return a != null && b != null ? `${s.short} ${bp(Math.round((b - a) * 100))}bp` : null;
  }).filter(Boolean).join(' · ');

  return { W, H, m, x, y, grid, ticks, paths, ends, moves };
}
