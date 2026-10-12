'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { RatesBrief as Brief, TapeRow, KeyRate, has, safeHtml } from '@/lib/rates-brief';
import { RANGES, Range, LINES, Line, ChartModel, toPoints, inRange, chartModel, bp } from '@/lib/rates-chart';
import RatesBriefPrint from './RatesBriefPrint';

// Colors: for rates and diesel a rise is bad (red); for stocks a rise is good (green).
const UP_BAD = 'text-red-700 dark:text-red-400';
const UP_GOOD = 'text-emerald-700 dark:text-emerald-400';
const FLAT = 'text-slate-500 dark:text-slate-400';
const rateCls = (x: number | null | undefined) => (x == null || x === 0 ? FLAT : x > 0 ? UP_BAD : UP_GOOD);
const stockCls = (x: number | null | undefined) => (x == null || x === 0 ? FLAT : x > 0 ? UP_GOOD : UP_BAD);

const MINUS = '−';
const pct = (x: number, d = 2) => `${x > 0 ? '+' : x < 0 ? MINUS : ''}${Math.abs(x).toFixed(d)}%`;
const money = (p: number) => '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function RatesBrief({ data: B }: { data: Brief }) {
  return (
    <>
    <div className="page !max-w-[1100px] !px-4 sm:!px-8 space-y-8 print:hidden">
      <header className="pb-4 border-b-2 border-navy dark:border-blue-300">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow">Sandpiper Capital LLC · Rates Brief</p>
          <button onClick={() => window.print()} className="btn-secondary !py-1 shrink-0" title="Print a 2-page brief (Letter)">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-6a2 2 0 012-2h14a2 2 0 012 2v6a1 1 0 01-1 1h-2M6 14h12v7H6z" /></svg>
            Print
          </button>
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 leading-snug [text-wrap:balance]">
          {B.headline || 'No brief yet'}
        </h1>
        {B.dateline && <p className="page-sub">{B.dateline}</p>}
      </header>

      {B.top && B.top.length > 0 && <TopFive items={B.top.slice(0, 5)} />}

      {B.tape?.length > 0 && (
        <Section title="Markets" sub="close · day · 1 year">
          <div className="grid grid-cols-1 min-[460px]:grid-cols-2 lg:grid-cols-4 gap-3">
            {B.tape.map(t => <TapeCard key={t.n} t={t} />)}
          </div>
        </Section>
      )}

      {B.key?.length > 0 && (
        <Section title="Key rates" sub="Δ in basis points">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {B.key.map(k => <KeyCard key={k.n} k={k} />)}
          </div>
        </Section>
      )}

      {B.series?.length > 1 && <YieldChart series={B.series} latest={B.ustDate} />}

      <Section title="FHLB Topeka" sub="advance rates">
        <div
          className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 [&_b]:text-slate-800 dark:[&_b]:text-slate-100"
          dangerouslySetInnerHTML={{ __html: safeHtml(B.fhlb) || 'n/a' }}
        />
      </Section>

      {(B.freight?.length > 0 || has(B.also)) && (
        <Section title="Freight & supply chain" sub="this week's releases">
          {B.freight?.length > 0 && (
            <div className="grid grid-cols-1 min-[460px]:grid-cols-2 lg:grid-cols-4 gap-3">
              {B.freight.map(f => (
                <div key={f.n} className="card px-4 py-3 flex flex-col gap-1">
                  <p className="stat-label">{f.n}</p>
                  <p className="text-[17px] font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">{has(f.v) ? f.v : 'n/a'}</p>
                  <Changes items={[[f.pl || 'Chg', has(f.pc) ? f.pc : null, FLAT], ['1Y', has(f.y) ? f.y : null, FLAT]]} />
                  {f.why && <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{f.why}</p>}
                </div>
              ))}
            </div>
          )}
          {has(B.also) && (
            <p className="mt-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">Also on the board: </span>
              <span dangerouslySetInnerHTML={{ __html: safeHtml(B.also) }} />
            </p>
          )}
        </Section>
      )}

      {B.spot && (
        <Section title="Sector spotlight" sub={B.spot.g}>
          {B.rota?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {B.rota.map(r => (
                <span key={r.d} className={r.on ? 'pill bg-navy text-white ring-navy dark:bg-blue-300 dark:text-slate-900 dark:ring-blue-300' : 'pill pill-slate'}>
                  <b className={r.on ? '' : 'text-slate-400'}>{r.d}</b> {r.g}
                </span>
              ))}
            </div>
          )}
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {(B.spot.rows || []).map(r => (
              <div key={r.t} className="px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {r.n}<span className="ml-1.5 font-mono text-[11px] font-normal text-slate-500">{r.t}</span>
                  </p>
                  <div className="flex items-baseline gap-4 font-mono tabular-nums text-xs">
                    <span className="text-slate-800 dark:text-slate-200">
                      {r.p != null ? money(r.p) : <span className="text-slate-400">close n/a</span>}
                      {r.asof && <span className="ml-1.5 font-sans text-[10px] text-slate-400">{r.asof}</span>}
                    </span>
                    <Labeled label="Day" value={r.c != null ? pct(r.c) : 'n/a'} cls={stockCls(r.c)} />
                    <Labeled label="1Y" value={r.y != null ? pct(r.y, 1) : 'n/a'} cls={stockCls(r.y)} />
                  </div>
                </div>
                {r.u && <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 max-w-[72ch]">{r.u}</p>}
              </div>
            ))}
          </div>
          {B.board && B.board.length > 0 && <Board board={B.board} />}
        </Section>
      )}

      {B.news?.length > 0 && (
        <Section title="What's moving">
          <div className="card divide-y divide-slate-100 dark:divide-slate-800">
            {B.news.map((n, i) => (
              <article key={i} className="px-4 py-3 grid grid-cols-1 sm:grid-cols-[110px_1fr] gap-1 sm:gap-4">
                <div><span className="pill pill-navy">{n.tag}</span></div>
                <div>
                  <h3 className="text-sm font-semibold leading-snug text-slate-900 dark:text-slate-100 [text-wrap:balance]">
                    {n.url ? (
                      <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:text-navy dark:hover:text-blue-300 underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2 hover:decoration-navy">
                        {n.h}
                      </a>
                    ) : n.h}
                  </h3>
                  {n.p && <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300 max-w-[70ch]">{n.p}</p>}
                  {n.src && <p className="mt-1 text-[11px] text-slate-400">{n.src}</p>}
                </div>
              </article>
            ))}
          </div>
        </Section>
      )}

      {B.sports && B.sports.length > 0 && (
        <Section title="Sports" sub="scores · talking points">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {B.sports.map((s, i) => (
              <div key={i} className="card px-4 py-3">
                <p className="stat-label">{s.lg} · {s.d}</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{s.h}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{s.p}</p>
                {s.url && <a href={s.url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-[11px] text-slate-400 hover:text-navy">{s.src || 'Source'}</a>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {has(B.foot) && (
        <footer
          className="pt-3 border-t border-slate-200 dark:border-slate-800 text-[11px] leading-relaxed text-slate-400 [&_a]:text-slate-500 [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: safeHtml(B.foot) }}
        />
      )}
    </div>
    <RatesBriefPrint data={B} />
    </>
  );
}

function TopFive({ items }: { items: NonNullable<Brief['top']> }) {
  return (
    <section className="card overflow-hidden">
      <div className="card-header !py-2.5 bg-navy/[0.03] dark:bg-blue-900/10">
        <h2 className="text-xs uppercase tracking-[0.12em] font-bold text-navy dark:text-blue-300">Top 5 today</h2>
        <span className="text-[10px] text-slate-400">headlines &amp; things to be mindful of</span>
      </div>
      <ol className="divide-y divide-slate-100 dark:divide-slate-800">
        {items.map((t, i) => (
          <li key={i} className="flex gap-3 px-4 py-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-navy text-[11px] font-semibold text-white dark:bg-blue-300 dark:text-slate-900">{i + 1}</span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-semibold leading-snug text-slate-900 dark:text-slate-100">
                {t.tag && <span className="pill pill-navy mr-2 align-[1px]">{t.tag}</span>}
                {t.url ? (
                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="hover:text-navy dark:hover:text-blue-300 underline decoration-slate-300 dark:decoration-slate-600 underline-offset-2">{t.h}</a>
                ) : t.h}
              </p>
              {t.p && <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{t.p}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="flex flex-wrap items-baseline gap-x-2.5 mb-3 text-xs uppercase tracking-[0.12em] font-bold text-navy dark:text-blue-300">
        {title}
        {sub && <span className="text-[10px] tracking-[0.08em] font-medium text-slate-400 normal-case sm:uppercase">{sub}</span>}
      </h2>
      {children}
    </section>
  );
}

function Labeled({ label, value, cls }: { label: string; value: string; cls: string }) {
  return (
    <span className="whitespace-nowrap">
      <i className="not-italic font-sans text-[10px] uppercase tracking-wide text-slate-400 mr-1">{label}</i>
      <span className={value === 'n/a' ? 'text-slate-400' : cls}>{value}</span>
    </span>
  );
}

// [label, displayed value or null, color class]
function Changes({ items }: { items: [string, string | null | undefined, string][] }) {
  const shown = items.filter(([, v]) => has(v));
  if (!shown.length) return <p className="text-[11px] text-slate-400">no change data</p>;
  return (
    <div className="flex flex-wrap gap-x-3 font-mono tabular-nums text-[11px]">
      {shown.map(([l, v, c]) => <Labeled key={l} label={l} value={v as string} cls={c} />)}
    </div>
  );
}

function TapeCard({ t }: { t: TapeRow }) {
  const color = t.rate ? rateCls : stockCls;
  return (
    <div className="card px-4 py-3 flex flex-col gap-1">
      <p className="stat-label">
        {t.n}{t.asof && <span className="ml-1.5 normal-case tracking-normal text-slate-400">as of {t.asof}</span>}
      </p>
      <p className="text-[17px] font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">{has(t.v) ? t.v : 'n/a'}</p>
      <Changes items={[['Day', t.ctext, color(t.c)], ['1Y', t.ytext, color(t.y)]]} />
      {t.why && <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{t.why}</p>}
    </div>
  );
}

function KeyCard({ k }: { k: KeyRate }) {
  const deltas: [string, number | null][] = [['1M', k.d1m], ['6M', k.d6m], ['1Y', k.d1y]];
  return (
    <div className="card px-4 py-3.5">
      <p className="stat-label">{k.n}</p>
      <p className="mt-0.5 text-2xl font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">
        {k.cur != null ? `${k.cur.toFixed(2)}%` : 'n/a'}
      </p>
      <div className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono tabular-nums text-[11px]">
        {deltas.map(([l, v]) => (
          <span key={l} className="contents">
            <span className="font-sans text-slate-400">Δ{l}</span>
            <span className={v != null ? rateCls(v) : 'text-slate-400'}>{v != null ? `${bp(v)}bp` : 'n/a'}</span>
          </span>
        ))}
      </div>
      {has(k.asof) && <p className="mt-2 text-[10px] text-slate-400">as of {k.asof}</p>}
    </div>
  );
}

function Board({ board }: { board: NonNullable<Brief['board']> }) {
  return (
    <div className="card overflow-x-auto mt-4">
      <table className="table-clean">
        <thead><tr><th>All sectors</th><th className="!text-right">Close</th><th className="!text-right">Day</th><th className="!text-right">As of</th></tr></thead>
        <tbody>
          {board.map(g => {
            const cs = g.rows.filter(r => r.c != null).map(r => r.c as number);
            const avg = cs.length ? cs.reduce((a, b) => a + b, 0) / cs.length : null;
            return [
              <tr key={g.g} className="group-row"><td colSpan={2}>{g.g}</td><td className={`num ${stockCls(avg)}`}>{avg != null ? `avg ${pct(avg)}` : ''}</td><td /></tr>,
              ...g.rows.map(r => (
                <tr key={g.g + r.t} className="row">
                  <td>{r.n}<span className="ml-1.5 font-mono text-[11px] text-slate-500">{r.t}</span></td>
                  <td className="num">{money(r.p)}</td>
                  <td className={`num ${stockCls(r.c)}`}>{r.c != null ? pct(r.c) : ''}</td>
                  <td className="num text-slate-500">{r.d}</td>
                </tr>
              )),
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── 2Y / 5Y / 10Y chart ────────────────────────────────────────────────

const RANGE_KEY = 'crm-rates-range';

// The chart drawing itself, shared with the printout. `hoverX` draws the crosshair.
export function ChartSvg({ c, label, hoverX, onMove, onLeave, fixedHeight = true, print = false }: {
  c: ChartModel;
  label: string;
  hoverX?: number | null;
  onMove?: (ev: React.PointerEvent<SVGSVGElement>) => void;
  onLeave?: () => void;
  fixedHeight?: boolean;
  print?: boolean;   // fixed light colors, independent of the CRM's dark mode
}) {
  const { W, H, m, y, grid, ticks, paths, ends } = c;
  // On screen, colors follow the theme through classes; in print they are fixed.
  const gridLine = print ? { stroke: '#E2E8F0' } : { className: 'stroke-slate-200 dark:stroke-slate-700' };
  const axisText = print ? { fill: '#64748B' } : { className: 'fill-slate-500 dark:fill-slate-400' };
  const halo = print ? { fill: '#64748B', stroke: '#FFFFFF' } : { className: 'fill-slate-500 dark:fill-slate-400 stroke-white dark:stroke-slate-900' };
  const lineProps = (s: Line) => (print ? { stroke: s.hex } : { className: s.stroke });
  const labelProps = (s: Line) => (print ? { fill: s.k === 1 ? '#64748B' : s.hex } : { className: s.fill });
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`} width="100%" height={fixedHeight ? H : undefined} className="block overflow-visible"
      role="img" aria-label={label} onPointerMove={onMove} onPointerLeave={onLeave}
    >
      {grid.map((v, i) => (
        <line key={v} x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} {...gridLine} strokeWidth={1} strokeDasharray={i === 0 ? undefined : '2 3'} />
      ))}
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={t.x} x2={t.x} y1={H - m.b} y2={H - m.b + 4} stroke="#94A3B8" />
          <text x={t.x} y={H - m.b + 16} textAnchor="middle" {...axisText} fontSize={10.5}>{t.label}</text>
        </g>
      ))}
      {paths.slice().reverse().map(({ s, segs }) => segs.map((pts, i) => (
        <polyline key={s.k + '-' + i} points={pts} fill="none" {...lineProps(s)} strokeWidth={s.w} strokeLinejoin="round" strokeLinecap="round" />
      )))}
      {grid.map((v, i) => (
        <text key={'l' + v} x={m.l} y={y(v) - 4} fontSize={10.5} {...halo} fontFamily="JetBrains Mono, monospace" strokeWidth={3} paintOrder="stroke">
          {v.toFixed(2)}{i === grid.length - 1 ? '%' : ''}
        </text>
      ))}
      {ends.map(e => (
        <g key={'e' + e.s.k}>
          <circle cx={e.x} cy={e.y} r={3} {...(print ? { fill: e.s.hex, stroke: '#FFFFFF' } : { className: `${e.s.fill} stroke-white dark:stroke-slate-900` })} strokeWidth={1.5} />
          <line x1={e.x + 4} x2={e.x + 10} y1={e.y} y2={e.ly} {...lineProps(e.s)} />
          <text x={e.x + 12} y={e.ly + 4} fontSize={11} fontWeight={600} {...labelProps(e.s)}>
            {e.s.name} <tspan fontFamily="JetBrains Mono, monospace">{e.v.toFixed(2)}%</tspan>
          </text>
        </g>
      ))}
      {hoverX != null && <line x1={hoverX} x2={hoverX} y1={m.t} y2={H - m.b} stroke="#94A3B8" strokeDasharray="2 2" />}
    </svg>
  );
}

function YieldChart({ series, latest }: { series: Brief['series']; latest: string }) {
  const [range, setRange] = useState<Range>('1y');
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try { const r = localStorage.getItem(RANGE_KEY) as Range | null; if (r && r in RANGES) setRange(r); } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    if (!box.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(300, Math.round(e.contentRect.width))));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const pick = (r: Range) => { setRange(r); setHover(null); try { localStorage.setItem(RANGE_KEY, r); } catch { /* ignore */ } };

  const all = useMemo(() => toPoints(series), [series]);
  const D = useMemo(() => inRange(all, range), [all, range]);
  const narrow = width < 520;
  const c = useMemo(() => chartModel(D, range, width, narrow ? 260 : 330, narrow), [D, range, width, narrow]);
  if (!c) return null;

  const onMove = (ev: React.PointerEvent<SVGSVGElement>) => {
    const r = ev.currentTarget.getBoundingClientRect();
    const px = (ev.clientX - r.left) * (c.W / r.width);
    let best = 0, bd = Infinity;
    D.forEach((p, i) => { const dd = Math.abs(c.x(p.d) - px); if (dd < bd) { bd = dd; best = i; } });
    setHover(best);
  };
  const hp = hover != null ? D[hover] : null;
  const hx = hp ? c.x(hp.d) : null;

  return (
    <section className="card px-4 sm:px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Treasury yields: 2-, 5- and 10-year</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Over the last {RANGES[range].label}: <span className="font-mono">{c.moves}</span>
          </p>
        </div>
        <div className="segmented" role="group" aria-label="Chart range">
          {(Object.keys(RANGES) as Range[]).map(r => (
            <button key={r} onClick={() => pick(r)} aria-pressed={range === r} className={`segment !px-2.5 uppercase ${range === r ? 'segment-active' : ''}`}>{r}</button>
          ))}
        </div>
      </div>

      <div ref={box} className="relative w-full mt-3">
        <ChartSvg
          c={c} hoverX={hx} onMove={onMove} onLeave={() => setHover(null)}
          label={`Line chart of 2-, 5- and 10-year Treasury yields over the last ${RANGES[range].label}`}
        />
        {hp && hx != null && (
          <div
            className="absolute top-1 pointer-events-none card !rounded-md px-2 py-1.5 text-[11px] whitespace-nowrap shadow-md"
            style={hx / c.W > 0.6 ? { right: `${((c.W - hx) / c.W) * 100 + 1}%` } : { left: `${(hx / c.W) * 100 + 1}%` }}
          >
            <b className="text-slate-800 dark:text-slate-100">{hp.d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</b>
            <br />
            <span className="font-mono text-slate-600 dark:text-slate-300">
              {LINES.map(s => `${s.short} ${hp.v[s.k] != null ? (hp.v[s.k] as number).toFixed(2) : 'n/a'}`).join(' · ')}
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Source: U.S. Department of the Treasury, daily par yield curve. Latest: {latest || 'n/a'}.</p>
    </section>
  );
}
