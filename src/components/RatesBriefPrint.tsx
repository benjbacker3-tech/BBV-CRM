'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RatesBrief as Brief, TapeRow, DeepDive, FocusItem, Reading, RundownItem, World, has, safeHtml, marketRows, rundownOf, sportOf, list, paras, calendarFrom } from '@/lib/rates-brief';
import { toPoints, inRange, chartModel, bp } from '@/lib/rates-chart';
import { ChartSvg, shortDay } from './RatesBrief';

// Three-page Letter printout of the Sandpiper Daily Brief (layout of Oct 19, 2026).
//   Page 1 · the numbers and the news: headline, rates (four cards + 1-year 2Y/5Y/10Y chart),
//            Fed funds / mortgage line, markets table, The Rundown, freight tiles, sports line.
//   Page 2 · deep dive (two-column body, table + what to watch), Data in focus (release,
//            chart, expert reads), calendar (this week | later).
//   Page 3 · World Desk (lead story, hotspot tracker, central bank watch, real policy rates),
//            then Investor's Corner.
// Never printed: `also`, `foot`, `world.src`, the deep dive's `dek`, and the retired rota / spot / news.
// Every section drops out when its key is missing, so older files (no `world`, no `focus`) still print.
// The sheets are a fixed size and kept off-screen until printing. Type never shrinks below its
// set size (MIN_SCALE = 1); a light day scales up a little to fill the page. A heavy day is
// trimmed, least useful first:
//   page 1: shorter chart; market notes to 1 line; rundown notes to 3 lines; freight notes to
//           2 lines; then the 7th rundown item
//   page 2: "Later" to 6 rows; expert reads to 2; deep-dive watch list off; its table off;
//           the focus chart off
//   page 3: takeaways off; World Desk views off; pull quote off; central banks to 4

const MIN_SCALE = 1;
const MAX_SCALE = 1.2;

// Light-only colors (the printout is always on white paper).
const NAVY = '#1E3A5F';
const RED = 'text-[#B42318]', GREEN = 'text-[#067647]', GRAY = 'text-slate-500';
const rateCls = (x: number | null | undefined) => (x == null || x === 0 ? GRAY : x > 0 ? RED : GREEN);
const stockCls = (x: number | null | undefined) => (x == null || x === 0 ? GRAY : x > 0 ? GREEN : RED);

const PRINT_CSS = `
@page { size: letter; margin: 0.35in; }
.rbp-root { position: fixed; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }
.rbp-sheet { width: 7.8in; height: 10.28in; position: relative; overflow: hidden; background: #fff; color: #0f172a;
  font-family: Inter, system-ui, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rbp-sheet:not(:last-child) { break-after: page; }
.rbp-body { position: absolute; left: 0; right: 0; top: 0; bottom: 0.22in; overflow: hidden; }
.rbp-fit { transform-origin: top left; }
.rbp-root a { color: inherit; text-decoration: none; }
.rbp-cols { column-count: 2; column-gap: 0.22in; }
.rbp-cols p { break-inside: avoid-column; margin: 0 0 4px; }
@media print {
  .rbp-root { position: static; visibility: visible; }
  html, body { background: #fff !important; }
}
`;

const P1_MAX = 5;
const P2_MAX = 5;
const P3_MAX = 4;

export default function RatesBriefPrint({ data: B }: { data: Brief }) {
  const [p1Level, setP1Level] = useState(0);
  const [p2Level, setP2Level] = useState(0);
  const [p3Level, setP3Level] = useState(0);
  // Trims only ever step up, so whenever the content or the fonts change, start the fit over.
  // Bumping `epoch` makes every sheet measure again even when a level was already 0.
  const [epoch, setEpoch] = useState(0);
  const restart = useCallback(() => { setP1Level(0); setP2Level(0); setP3Level(0); setEpoch(e => e + 1); }, []);
  useEffect(() => { restart(); }, [B, restart]);
  useEffect(() => { document.fonts?.ready.then(restart).catch(() => {}); }, [restart]);

  // Print light even when the CRM is in dark mode.
  useEffect(() => {
    let wasDark = false;
    const before = () => { wasDark = document.documentElement.classList.contains('dark'); document.documentElement.classList.remove('dark'); };
    const after = () => { if (wasDark) document.documentElement.classList.add('dark'); };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  const onOverflow1 = useCallback(() => setP1Level(l => Math.min(l + 1, P1_MAX)), []);
  const onOverflow2 = useCallback(() => setP2Level(l => Math.min(l + 1, P2_MAX)), []);
  const onOverflow3 = useCallback(() => setP3Level(l => Math.min(l + 1, P3_MAX)), []);
  const reading = B.reading && B.reading.title ? B.reading : null;
  const world = B.world && B.world.lead && B.world.lead.title ? B.world : null;
  const pages = reading || world ? 3 : 2;
  const datelineShort = (B.dateline || '').split('·')[0].trim();

  return (
    <div className="rbp-root" aria-hidden data-levels={`${p1Level},${p2Level},${p3Level},${epoch}`}>
      <style>{PRINT_CSS}</style>
      <Sheet page={1} pages={pages} footer={datelineShort} onOverflow={onOverflow1} deps={[B, p1Level, epoch]}>
        <PageOne B={B} level={p1Level} />
      </Sheet>
      <Sheet page={2} pages={pages} footer={datelineShort} onOverflow={onOverflow2} deps={[B, p2Level, epoch]}>
        <PageTwo B={B} level={p2Level} />
      </Sheet>
      {pages === 3 && (
        <Sheet page={3} pages={pages} maxScale={1.1} footer={datelineShort} onOverflow={onOverflow3} deps={[B, p3Level, epoch]}>
          <PageThree B={B} w={world} r={reading} level={p3Level} />
        </Sheet>
      )}
    </div>
  );
}

// A page-sized sheet that scales its content up to fill the page (never below MIN_SCALE).
function Sheet({ page, pages, maxScale = MAX_SCALE, footer, onOverflow, deps, children }: {
  page: number; pages: number; maxScale?: number; footer: string; onOverflow: () => void; deps: unknown[]; children: React.ReactNode;
}) {
  const body = useRef<HTMLDivElement>(null);
  const fit = useRef<HTMLDivElement>(null);

  const doFit = useCallback(() => {
    const b = body.current, f = fit.current;
    if (!b || !f) return;
    const W = b.clientWidth, H = b.clientHeight;
    const heightAt = (s: number) => { f.style.width = `${W / s}px`; return f.offsetHeight * s; };
    if (heightAt(MIN_SCALE) > H) {
      f.style.transform = `scale(${MIN_SCALE})`;
      f.dataset.scale = 'overflow';
      onOverflow();
      return;
    }
    let lo = MIN_SCALE, hi = maxScale, best = MIN_SCALE;
    for (let i = 0; i < 16; i++) {
      const s = (lo + hi) / 2;
      if (heightAt(s) <= H) { best = s; lo = s; } else hi = s;
    }
    f.style.width = `${W / best}px`;
    f.style.transform = `scale(${best})`;
    f.dataset.scale = best.toFixed(3);
  }, [onOverflow, maxScale]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { doFit(); }, [doFit, ...deps]);
  useEffect(() => {
    window.addEventListener('beforeprint', doFit);
    return () => window.removeEventListener('beforeprint', doFit);
  }, [doFit]);

  return (
    <div className="rbp-sheet">
      <div ref={body} className="rbp-body">
        <div ref={fit} className="rbp-fit">{children}</div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex justify-between border-t border-slate-200 pt-0.5 text-[8px] text-slate-400">
        <span>Sandpiper Capital LLC · Daily Brief{footer ? ` · ${footer}` : ''}</span>
        <span>Page {page} of {pages}</span>
      </div>
    </div>
  );
}

function H2({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <h2 className="mb-1 mt-2.5 flex items-baseline gap-2 border-b border-slate-300 pb-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#1E3A5F]">
      {children}
      {sub && <span className="text-[8.5px] font-medium normal-case tracking-normal text-slate-500">{sub}</span>}
    </h2>
  );
}

const LABEL = 'text-[7.5px] font-semibold uppercase tracking-[0.08em] text-slate-500';
const TXT = 'text-[9.5px] leading-[1.42] text-slate-800';
const html = (s: string | null | undefined) => ({ __html: safeHtml(s) });

function Masthead({ B }: { B: Brief }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b-2 border-[#1E3A5F] pb-1">
      <p className="text-[9.5px] font-bold uppercase tracking-[0.2em] text-[#1E3A5F]">Sandpiper <span className="text-slate-900">Daily Brief</span></p>
      <p className="text-right text-[9px] text-slate-600">{B.dateline}</p>
    </div>
  );
}

function Chg({ label, v, cls }: { label: string; v: string; cls: string }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-sans text-[7.5px] font-semibold uppercase text-slate-400">{label} </span>
      <span className={`font-semibold ${cls}`}>{v}</span>
    </span>
  );
}

// ── Page 1 · the numbers and the news ──────────────────────────────────

function PageOne({ B, level }: { B: Brief; level: number }) {
  const chartH = level === 0 ? 150 : 125;
  const D = useMemo(() => inRange(toPoints(B.series || []), '1y'), [B.series]);
  const c = useMemo(() => chartModel(D, '1y', 400, chartH, true), [D, chartH]);
  const keys = list<Brief['key'][number]>(B.key);
  const econ = list<NonNullable<Brief['econ']>[number]>(B.econ);
  const markets = marketRows(B).filter(t => !/^10Y Treasury/i.test(t.n) && !/^Diesel/i.test(t.n));
  const rundown = rundownOf(B).slice(0, level >= 5 ? 6 : 7);
  const freight = list<Brief['freight'][number]>(B.freight).slice(0, 3);
  const sport = sportOf(B);
  return (
    <div>
      <Masthead B={B} />
      {has(B.headline) && <h1 className="mt-1.5 text-[14.5px] font-bold leading-snug text-slate-900">{B.headline}</h1>}

      {(keys.length > 0 || c) && (
        <>
          <H2 sub="basis points · red = rates up">Rates</H2>
          <div className="grid grid-cols-[1fr_1.15fr] items-start gap-3">
            <div className="grid grid-cols-2 gap-1.5">
              {keys.map(k => (
                <div key={k.n} className="rounded border border-slate-200 px-2 py-1">
                  <p className={LABEL}>{k.n}</p>
                  <p className="font-mono text-[14px] font-semibold leading-tight text-slate-900">{k.cur != null ? `${k.cur.toFixed(2)}%` : '—'}</p>
                  <p className="mt-0.5 flex gap-2 font-mono text-[9px]">
                    {([['1M', k.d1m], ['6M', k.d6m], ['1Y', k.d1y]] as const).map(([l, v]) => v != null && <Chg key={l} label={l} v={bp(v)} cls={rateCls(v)} />)}
                  </p>
                  {has(k.asof) && <p className="text-[7.5px] text-slate-400">{k.asof}</p>}
                </div>
              ))}
            </div>
            {c && (
              <div>
                <p className="text-[8.5px] text-slate-500"><b className="text-slate-700">Treasury yields, past year:</b> <span className="font-mono">{c.moves}</span></p>
                <ChartSvg c={c} fixedHeight={false} print label="2-, 5- and 10-year Treasury yields, past year" />
                {has(B.ustDate) && <p className="text-[7.5px] text-slate-400">Treasury par yields, daily · latest {B.ustDate}</p>}
              </div>
            )}
          </div>
          {econ.length > 0 && (
            <p className="mt-1 text-[9.5px] leading-snug text-slate-700">
              {econ.map((r, i) => (
                <span key={r.n}>
                  {i > 0 && <span className="mx-1.5 text-slate-300">·</span>}
                  <span className="text-slate-500">{r.n}</span>{' '}
                  <b className={`font-mono ${r.good == null ? 'text-slate-900' : r.good ? GREEN : RED}`}>{r.v}</b>
                  {r.d && <span className="text-slate-500"> ({r.d})</span>}
                </span>
              ))}
            </p>
          )}
        </>
      )}

      {markets.length > 0 && (
        <>
          <H2 sub="close · day · 1 year">Markets</H2>
          <table className="w-full border-collapse">
            <tbody>
              {markets.map(t => <MarketRow key={t.n} t={t} clamp={level >= 2} />)}
            </tbody>
          </table>
        </>
      )}

      {rundown.length > 0 && (
        <>
          <H2 sub="what matters this morning">The Rundown</H2>
          <ol className="space-y-[5px]">
            {rundown.map((t, i) => <RundownRow key={i} t={t} n={i + 1} clamp={level >= 3} />)}
          </ol>
        </>
      )}

      {freight.length > 0 && (
        <>
          <H2>Freight &amp; supply chain</H2>
          <div className="grid gap-px overflow-hidden rounded border border-slate-200 bg-slate-200" style={{ gridTemplateColumns: `repeat(${freight.length}, minmax(0, 1fr))` }}>
            {freight.map(f => (
              <div key={f.n} className="bg-white px-2 py-1">
                <p className={LABEL}>{f.n}</p>
                <p className="font-mono text-[12px] font-semibold leading-tight text-slate-900">{f.v}</p>
                <p className="flex gap-2 font-mono text-[9px] text-slate-600">
                  {has(f.pc) && <Chg label={f.pl || 'Chg'} v={f.pc as string} cls="text-slate-700" />}
                  {has(f.y) && <Chg label="1Y" v={f.y as string} cls="text-slate-700" />}
                </p>
                {has(f.why) && <p className={`mt-0.5 text-[8.5px] leading-snug text-slate-600 ${level >= 4 ? 'line-clamp-2' : ''}`}>{f.why}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {has(sport) && (
        <p className="mt-2 border-t border-slate-200 pt-1 text-[9.5px] leading-snug text-slate-700">
          <b className="mr-1.5 text-[8px] uppercase tracking-[0.1em] text-[#1E3A5F]">Sports</b>
          <span dangerouslySetInnerHTML={html(sport)} />
        </p>
      )}
    </div>
  );
}

function MarketRow({ t, clamp }: { t: TapeRow; clamp: boolean }) {
  const cls = t.rate ? rateCls : stockCls;
  return (
    <tr className="border-b border-slate-100 align-top">
      <td className="w-[13%] py-[2px] pr-2 text-[9.5px] font-semibold text-slate-900">{t.n}</td>
      <td className="w-[11%] py-[2px] pr-2 text-right font-mono text-[10px] font-semibold text-slate-900 whitespace-nowrap">{t.v}</td>
      <td className="w-[13%] py-[2px] pr-2 font-mono text-[9px] whitespace-nowrap">{has(t.ctext) && <Chg label="Day" v={t.ctext as string} cls={cls(t.c)} />}</td>
      <td className="w-[11%] py-[2px] pr-2 font-mono text-[9px] whitespace-nowrap">{has(t.ytext) && <Chg label="1Y" v={t.ytext as string} cls={cls(t.y)} />}</td>
      <td className="py-[2px] text-[9px] leading-snug text-slate-700"><div className={clamp ? 'line-clamp-1' : ''}>{t.why}</div></td>
    </tr>
  );
}

function RundownRow({ t, n, clamp }: { t: RundownItem; n: number; clamp: boolean }) {
  return (
    <li className="flex gap-1.5">
      <span className="mt-[1px] flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-full bg-[#1E3A5F] text-[8.5px] font-bold text-white">{n}</span>
      <p className={`min-w-0 ${TXT} ${clamp ? 'line-clamp-3' : ''}`}>
        {t.tag && <span className="mr-1 text-[7.5px] font-bold uppercase tracking-[0.08em] text-[#1E3A5F]">{t.tag}</span>}
        <b className="font-semibold text-slate-900">{t.h}</b>{' '}
        <span dangerouslySetInnerHTML={html(t.p)} />
      </p>
    </li>
  );
}

// ── Page 2 · deep dive, data in focus, calendar ────────────────────────

function PageTwo({ B, level }: { B: Brief; level: number }) {
  const cal = calendarFrom(B.cal, B.dateline);
  const later = level >= 1 ? cal.later.slice(0, 6) : cal.later;
  const focus = list<FocusItem>(B.focus?.items).filter(f => typeof f === 'object' && f.title);
  return (
    <div>
      <Masthead B={B} />

      {B.dive && B.dive.title && <DivePrint d={B.dive} watch={level < 3} table={level < 4} />}

      {focus.length > 0 && (
        <>
          <H2 sub="the numbers that mattered, and what experts make of them">Data in focus</H2>
          <div className="space-y-2">
            {focus.map((f, i) => <FocusPrint key={i} f={f} experts={level >= 2 ? 2 : 99} chart={level < 5} />)}
          </div>
        </>
      )}

      {(cal.week.length > 0 || later.length > 0) && (
        <>
          <H2 sub="consensus · prior">Calendar</H2>
          <div className="grid grid-cols-2 items-start gap-4">
            {cal.week.length > 0 && (
              <CalTable title="This week" head={['Date', 'Release', 'Cons.', 'Prior']} rows={cal.week.map(i => [
                shortDay(i.d), i.e, has(i.cons) ? i.cons as string : '', has(i.prior) ? i.prior as string : '',
              ])} />
            )}
            {later.length > 0 && (
              <CalTable title="Later" head={['Date', 'Event', 'Why']} rows={later.map(i => [shortDay(i.d), i.e, i.why || ''])} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CalTable({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  const th = 'py-[2px] pr-1.5 text-left text-[7.5px] font-semibold uppercase tracking-[0.05em] text-slate-500';
  return (
    <div>
      <p className="mb-0.5 text-[9px] font-bold text-slate-700">{title}</p>
      <table className="w-full border-collapse">
        <thead><tr className="border-b border-slate-300">{head.map((h, i) => <th key={i} className={`${th} ${i >= 2 && head.length === 4 ? '!text-right' : ''}`}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, k) => (
            <tr key={k} className="border-b border-slate-100 align-top">
              <td className="py-[2px] pr-1.5 font-mono text-[8.5px] font-semibold whitespace-nowrap text-[#1E3A5F]">{r[0]}</td>
              <td className="py-[2px] pr-1.5 text-[9px] font-medium leading-snug text-slate-900">{r[1]}</td>
              {head.length === 4
                ? <>
                    <td className="py-[2px] pl-1 text-right font-mono text-[9px] whitespace-nowrap text-slate-700">{r[2]}</td>
                    <td className="py-[2px] pl-1 text-right font-mono text-[9px] whitespace-nowrap text-slate-500">{r[3]}</td>
                  </>
                : <td className="py-[2px] text-[8.5px] leading-snug text-slate-600">{r[2]}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DivePrint({ d, watch, table }: { d: DeepDive; watch: boolean; table: boolean }) {
  const rows = d.table ? list<string[]>(d.table.rows) : [];
  const w = list<string>(d.watch);
  const showTable = table && rows.length > 0, showWatch = watch && w.length > 0;
  return (
    <>
      <H2 sub={d.kicker}>Deep dive</H2>
      <h3 className="text-[13.5px] font-bold leading-snug text-slate-900">{d.title}</h3>
      <div className={`rbp-cols mt-1 ${TXT}`}>
        {paras(d.body).map((p, i) => <p key={i} dangerouslySetInnerHTML={html(p)} />)}
      </div>
      {(showTable || showWatch) && (
        <div className={`mt-1 grid items-start gap-3 ${showTable && showWatch ? 'grid-cols-[1.5fr_1fr]' : 'grid-cols-1'}`}>
          {showTable && d.table && (
            <div>
              {d.table.cap && <p className="mb-0.5 text-[8.5px] font-bold text-slate-700">{d.table.cap}</p>}
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-slate-300">{list<string>(d.table.cols).map((c, i) => <th key={i} className="py-[2px] pr-1.5 text-left text-[7.5px] font-semibold uppercase tracking-[0.05em] text-slate-500">{c}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 align-top">{list<string>(r).map((c, j) => <td key={j} className={`py-[2px] pr-1.5 text-[8.5px] leading-snug ${j === 0 ? 'font-semibold text-slate-900' : j === 1 ? 'font-mono text-slate-800' : 'text-slate-500'}`}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {showWatch && (
            <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1">
              <p className="text-[7.5px] font-bold uppercase tracking-[0.1em] text-[#1E3A5F]">What to watch</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-3 text-[8.5px] leading-snug text-slate-700">
                {w.map((x, i) => <li key={i} dangerouslySetInnerHTML={html(x)} />)}
              </ul>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function FocusPrint({ f, experts, chart }: { f: FocusItem; experts: number; chart: boolean }) {
  const pts = (f.chart ? list<[string, number]>(f.chart.pts) : []).filter(p => Array.isArray(p) && typeof p[1] === 'number');
  const ex = list<NonNullable<FocusItem['experts']>[number]>(f.experts).slice(0, experts);
  const showChart = chart && pts.length > 1;
  return (
    <div>
      <p className="text-[11px] font-bold leading-snug text-slate-900">
        {f.tag && <span className="mr-1.5 text-[7.5px] font-bold uppercase tracking-[0.08em] text-[#1E3A5F]">{f.tag}</span>}
        {f.title}
      </p>
      {(has(f.act) || has(f.cons) || has(f.prior)) && (
        <p className="mt-0.5 flex gap-3 font-mono text-[9.5px]">
          {f.rel && <span className="font-sans text-[8.5px] text-slate-500">{f.rel}</span>}
          {has(f.act) && <Chg label="Actual" v={f.act as string} cls={f.good == null ? 'text-slate-900' : f.good ? GREEN : RED} />}
          {has(f.cons) && <Chg label="Consensus" v={f.cons as string} cls="text-slate-700" />}
          {has(f.prior) && <Chg label="Prior" v={f.prior as string} cls="text-slate-500" />}
        </p>
      )}
      <div className={`mt-1 grid items-start gap-3 ${showChart ? 'grid-cols-[1.75fr_1fr]' : 'grid-cols-1'}`}>
        <div className={`space-y-1 ${TXT}`}>
          {paras(f.body).map((p, i) => <p key={i} dangerouslySetInnerHTML={html(p)} />)}
        </div>
        {showChart && (
          <div>
            {f.chart?.t && <p className="text-[8px] font-semibold text-slate-600">{f.chart.t}</p>}
            <MiniLine pts={pts} unit={f.chart?.unit || ''} />
          </div>
        )}
      </div>
      {ex.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[9px] leading-snug text-slate-700">
          {ex.map((e, i) => (
            <li key={i} className="border-l-2 border-slate-200 pl-1.5">
              <b className="text-slate-900">{e.who}:</b> <span dangerouslySetInnerHTML={html(e.view)} />
              {e.src && <span className="text-[8px] text-slate-400"> ({e.src})</span>}
            </li>
          ))}
        </ul>
      )}
      {has(f.lean) && <p className="mt-1 text-[9px] italic leading-snug text-slate-600"><b className="not-italic text-slate-800">Where forecasters lean:</b> {f.lean}</p>}
    </div>
  );
}

// Chart colors: fixed hex for print; the screen passes CSS variables so dark mode works.
export interface ChartInk { line: string; text: string; grid: string; strong: string }
const PRINT_INK: ChartInk = { line: NAVY, text: '#64748B', grid: '#E2E8F0', strong: '#0F172A' };

// A small line chart for a "Data in focus" release: points left to right, latest value labeled.
export function MiniLine({ pts, unit, ink = PRINT_INK }: { pts: [string, number][]; unit: string; ink?: ChartInk }) {
  const W = 230, H = 105, m = { l: 24, r: 30, t: 8, b: 14 };
  const vals = pts.map(p => p[1]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo || 1) * 0.15; lo -= pad; hi += pad;
  const x = (i: number) => m.l + (i / (pts.length - 1)) * (W - m.l - m.r);
  const y = (v: number) => m.t + ((hi - v) / (hi - lo)) * (H - m.t - m.b);
  const grid = [lo + pad, (lo + hi) / 2, hi - pad];
  const last = pts[pts.length - 1];
  const fmtV = (v: number) => `${+v.toFixed(2)}${unit}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Release history">
      {grid.map((g, i) => (
        <g key={i}>
          <line x1={m.l} x2={W - m.r} y1={y(g)} y2={y(g)} stroke={ink.grid} strokeWidth={0.75} />
          <text x={m.l - 3} y={y(g) + 3} textAnchor="end" fontSize={7} fill={ink.text}>{+g.toFixed(1)}</text>
        </g>
      ))}
      <polyline points={pts.map((p, i) => `${x(i).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ')} fill="none" stroke={ink.line} strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(last[1])} r={2.5} fill={ink.line} stroke="none" strokeWidth={1} />
      <text x={x(pts.length - 1) + 4} y={y(last[1]) + 3} fontSize={8} fontWeight={700} fill={ink.line} fontFamily="JetBrains Mono, monospace">{fmtV(last[1])}</text>
      <text x={m.l} y={H - 3} fontSize={7} fill={ink.text}>{pts[0][0]}</text>
      <text x={W - m.r} y={H - 3} fontSize={7} fill={ink.text} textAnchor="end">{last[0]}</text>
    </svg>
  );
}

// ── Page 3 · World Desk and Investor's Corner ──────────────────────────

export const TREND: Record<string, string> = { esc: 'text-[#B42318] border-[#B42318]', eas: 'text-[#067647] border-[#067647]', std: 'text-slate-500 border-slate-400' };

function PageThree({ B, w, r, level }: { B: Brief; w: World | null; r: Reading | null; level: number }) {
  return (
    <div>
      <Masthead B={B} />
      {w && <WorldPrint w={w} views={level < 2} cbMax={level >= 4 ? 4 : 99} />}
      {r && <CornerPrint r={r} takeaways={level < 1} quote={level < 3} />}
    </div>
  );
}

function WorldPrint({ w, views, cbMax }: { w: World; views: boolean; cbMax: number }) {
  const lead = w.lead!;
  const vs = list<NonNullable<NonNullable<World['lead']>['views']>[number]>(lead.views).slice(0, 2);
  const hot = list<NonNullable<World['hot']>[number]>(w.hot).filter(h => typeof h === 'object' && h.r);
  const cb = list<NonNullable<World['cb']>[number]>(w.cb).filter(c => typeof c === 'object' && c.bank).slice(0, cbMax);
  const real = w.real && list<[string, number]>(w.real.pts).filter(p => Array.isArray(p) && typeof p[1] === 'number');
  const th = 'py-[2px] pr-2 text-left text-[7.5px] font-semibold uppercase tracking-[0.05em] text-slate-500';
  return (
    <>
      <H2>World Desk</H2>
      {lead.kicker && <p className="text-[7.5px] font-bold uppercase tracking-[0.12em] text-[#1E3A5F]">{lead.kicker}</p>}
      <h3 className="text-[13.5px] font-bold leading-snug text-slate-900">{lead.title}</h3>
      <div className={`rbp-cols mt-1 ${TXT}`}>
        {paras(lead.body).map((p, i) => <p key={i} dangerouslySetInnerHTML={html(p)} />)}
      </div>
      {has(lead.reach) && (
        <p className="mt-1 rounded-r border-l-[3px] border-[#1E3A5F] bg-slate-50 px-2 py-1 text-[9px] leading-snug text-slate-700"
          dangerouslySetInnerHTML={html(`<b>How it reaches you:</b> ${lead.reach}`)} />
      )}
      {views && vs.length > 0 && (
        <div className="mt-1 grid grid-cols-2 gap-3">
          {vs.map((v, i) => (
            <p key={i} className="border-l-2 border-slate-200 pl-1.5 text-[9px] leading-snug text-slate-700">
              <b className="text-slate-900">{v.who}:</b> <span dangerouslySetInnerHTML={html(v.view)} />
            </p>
          ))}
        </div>
      )}

      {hot.length > 0 && (
        <>
          <p className="mb-0.5 mt-2 text-[8.5px] font-bold uppercase tracking-[0.1em] text-[#1E3A5F]">Hotspot tracker</p>
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-slate-300">{['Region', 'What changed', 'Trend', 'Market channel', 'Next date'].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
            <tbody>
              {hot.map((h, i) => (
                <tr key={i} className="border-b border-slate-100 align-top text-[8.5px] leading-snug">
                  <td className="w-[13%] py-[2px] pr-2 font-semibold text-slate-900">{h.r}</td>
                  <td className="py-[2px] pr-2 text-slate-700">{h.chg}</td>
                  <td className="w-[15%] py-[2px] pr-2">
                    <span className={`inline-block rounded-[3px] border px-1 py-px text-[7px] font-bold uppercase tracking-[0.05em] ${TREND[h.tc || 'std'] || TREND.std}`}>{h.trend}</span>
                  </td>
                  <td className="w-[19%] py-[2px] pr-2 text-slate-700">{h.ch}</td>
                  <td className="w-[15%] py-[2px] text-slate-700">{h.next}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {(cb.length > 0 || (real && real.length > 0)) && (
        <div className="mt-2 grid grid-cols-2 items-start gap-4">
          {cb.length > 0 ? (
            <div>
              <p className="mb-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em] text-[#1E3A5F]">Central bank watch <span className="ml-1 font-medium normal-case tracking-normal text-slate-500">next 3 weeks, ex-Fed</span></p>
              <ul>
                {cb.map((c, i) => (
                  <li key={i} className="grid grid-cols-[38px_1fr] gap-1.5 border-b border-slate-100 py-[2px] text-[8.5px] leading-snug text-slate-700">
                    <span className="font-mono font-semibold text-[#1E3A5F]">{/^\d{4}-\d{2}-\d{2}$/.test(c.d) ? shortDay(c.d) : c.d}</span>
                    <span><b className="text-slate-900">{c.bank}</b>, {c.rate}: {c.exp}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : <div />}
          {real && real.length > 0 && (
            <div>
              <p className="mb-0.5 text-[8.5px] font-bold uppercase tracking-[0.1em] text-[#1E3A5F]">{w.real?.t || "Who's really tight?"} <span className="ml-1 font-medium normal-case tracking-normal text-slate-500">policy rate minus CPI</span></p>
              <RealBars pts={real} />
              <p className="text-[7.5px] text-slate-400">0 = rates match inflation</p>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// Horizontal bars from a zero line: names on the left, signed values at each bar's end.
export function RealBars({ pts, ink = PRINT_INK }: { pts: [string, number][]; ink?: ChartInk }) {
  const row = 13, W = 300, L = 58, pad = 30;
  const H = pts.length * row + 2;
  const lo = Math.min(0, ...pts.map(p => p[1])), hi = Math.max(0, ...pts.map(p => p[1]));
  const x = (v: number) => L + pad + ((v - lo) / (hi - lo || 1)) * (W - L - 2 * pad);
  const z = x(0);
  const sign = (v: number) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label="Real policy rates by country">
      {pts.map(([n, v], i) => {
        const yy = i * row + 1, x0 = Math.min(z, x(v)), bw = Math.abs(x(v) - z);
        return (
          <g key={n}>
            <text x={L - 4} y={yy + row / 2 + 3} textAnchor="end" fontSize={8} fill={ink.text}>{n}</text>
            <rect x={x0} y={yy + 2} width={Math.max(bw, 0.5)} height={row - 4} fill={ink.line} fillOpacity={v >= 0 ? 1 : 0.4} />
            <text x={v >= 0 ? x(v) + 3 : x(v) - 3} y={yy + row / 2 + 3} textAnchor={v >= 0 ? 'start' : 'end'} fontSize={7.5} fontWeight={600} fill={ink.strong} fontFamily="JetBrains Mono, monospace">{sign(v)}</text>
          </g>
        );
      })}
      <line x1={z} x2={z} y1={0} y2={H} stroke={ink.text} strokeWidth={0.75} />
    </svg>
  );
}

function CornerPrint({ r, takeaways, quote }: { r: Reading; takeaways: boolean; quote: boolean }) {
  const t = list<string>(r.takeaways);
  return (
    <>
      <H2 sub={[r.kind, r.who].filter(Boolean).join(' · ')}>Investor&apos;s Corner</H2>
      <h3 className="text-[13.5px] font-bold leading-snug text-slate-900">{r.title}</h3>
      {r.dek && <p className="text-[9.5px] italic leading-snug text-slate-600">{r.dek}</p>}
      {quote && r.quote && r.quote.text && (
        <blockquote className="my-1 border-l-[3px] border-[#1E3A5F] pl-2">
          <p className="font-serif text-[11px] italic leading-snug text-slate-800">“{r.quote.text}”</p>
          {r.quote.src && <p className="text-[8px] text-slate-500">{r.quote.src}</p>}
        </blockquote>
      )}
      <div className={`rbp-cols mt-1 ${TXT}`}>
        {paras(r.body).map((p, i) => <p key={i} dangerouslySetInnerHTML={html(p)} />)}
      </div>
      {takeaways && t.length > 0 && (
        <ul className="mt-1 list-disc space-y-0.5 pl-3.5 text-[9px] leading-snug text-slate-700">
          {t.map((x, i) => <li key={i} dangerouslySetInnerHTML={html(x)} />)}
        </ul>
      )}
      {r.src && <p className="mt-1 text-[7.5px] text-slate-400">{r.src}</p>}
    </>
  );
}
