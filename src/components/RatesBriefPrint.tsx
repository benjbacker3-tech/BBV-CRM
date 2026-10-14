'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RatesBrief as Brief, TapeRow, CalItem, DeepDive, Reading, RundownItem, has, safeHtml, marketRows, rateLevels, splitCalendar, rundownOf, sportOf } from '@/lib/rates-brief';
import { toPoints, inRange, chartModel, bp } from '@/lib/rates-chart';
import { ChartSvg, datesAhead, dayLabel, shortDay } from './RatesBrief';

// Two-page Letter printout of the Sandpiper Daily Brief, a morning investor newsletter.
//   Page 1 · the numbers and the news: headline, rates (table + 10Y chart), markets strip
//            with a line on each move, The Rundown (5–7 items).
//   Page 2 · the deep dive (one structural topic), compact economic calendar (last week |
//            this week, plus further-out dates), freight table, one line of sports.
// The sheets are a fixed size and kept off-screen until printing. Type never shrinks below its
// set size (MIN_SCALE = 1); a light day scales up to fill the page. A heavy day is trimmed,
// least useful first:
//   page 1: shorter chart, then shortest; market notes to 2 lines; rundown notes to 3 lines;
//           then the 7th rundown item
//   page 2: freight notes to 2 lines; further-out dates off; freight notes to 1 line;
//           deep-dive watch list off; its table off
//   page 3 (Investor's Corner, when there is one): takeaways off, then the pull quote. It scales up
//           only a little, so a half-page piece reads as a half page.

const MIN_SCALE = 1;
const MAX_SCALE = 1.3;

// Light-only colors (the printout is always on white paper).
const RED = 'text-[#B42318]', GREEN = 'text-[#067647]', GRAY = 'text-slate-500';
const rateCls = (x: number | null | undefined) => (x == null || x === 0 ? GRAY : x > 0 ? RED : GREEN);
const stockCls = (x: number | null | undefined) => (x == null || x === 0 ? GRAY : x > 0 ? GREEN : RED);

const PRINT_CSS = `
@page { size: letter; margin: 0.4in; }
.rbp-root { position: fixed; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }
.rbp-sheet { width: 7.7in; height: 10.15in; position: relative; overflow: hidden; background: #fff; color: #0f172a;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rbp-sheet + .rbp-sheet { break-before: page; }
.rbp-body { position: absolute; left: 0; right: 0; top: 0; bottom: 0.26in; overflow: hidden; }
.rbp-fit { transform-origin: top left; }
.rbp-root a { color: inherit; text-decoration: none; }
@media print {
  .rbp-root { position: static; visibility: visible; }
  html, body { background: #fff !important; }
}
`;

const P1_MAX = 5;
const P2_MAX = 5;
const P3_MAX = 2;

export default function RatesBriefPrint({ data: B }: { data: Brief }) {
  const [p1Level, setP1Level] = useState(0);
  const [p2Level, setP2Level] = useState(0);
  const [p3Level, setP3Level] = useState(0);
  // Trims only ever step up, so whenever the content or the fonts change, start the fit over.
  // Bumping `epoch` makes both sheets measure again even when a level was already 0.
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
  const pages = reading ? 3 : 2;
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
      {reading && (
        <Sheet page={3} pages={pages} maxScale={1.08} footer={datelineShort} onOverflow={onOverflow3} deps={[B, p3Level, epoch]}>
          <PageThree B={B} r={reading} level={p3Level} />
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
      <div className="absolute bottom-0 left-0 right-0 flex justify-between border-t border-slate-200 pt-1 text-[9px] text-slate-400">
        <span>Sandpiper Capital LLC · Daily Brief{footer ? ` · ${footer}` : ''}</span>
        <span>Page {page} of {pages}</span>
      </div>
    </div>
  );
}

function H2({ children, sub }: { children: React.ReactNode; sub?: string }) {
  return (
    <h2 className="mb-1.5 mt-3 flex items-baseline gap-2 border-b-[1.5px] border-[#1E3A5F]/25 pb-1 text-[11px] font-bold uppercase tracking-[0.12em] text-[#1E3A5F]">
      {children}
      {sub && <span className="text-[9.5px] font-medium normal-case tracking-normal text-slate-500">{sub}</span>}
    </h2>
  );
}

const LABEL = 'text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500';

function Masthead({ B }: { B: Brief }) {
  return (
    <div className="border-b-2 border-[#1E3A5F] pb-2">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#1E3A5F]">Sandpiper <span className="text-slate-900">Daily Brief</span></p>
        <p className="text-right text-[10.5px] text-slate-600">{B.dateline}</p>
      </div>
    </div>
  );
}

function Chg({ label, text, cls }: { label: string; text?: string | null; cls: string }) {
  if (!has(text)) return null;
  return (
    <span className="mr-2.5 whitespace-nowrap">
      <span className="font-sans text-[9px] font-semibold uppercase text-slate-400">{label} </span>
      <span className={`font-semibold ${cls}`}>{text}</span>
    </span>
  );
}

// ── Page 1 · the numbers and the news ──────────────────────────────────

function PageOne({ B, level }: { B: Brief; level: number }) {
  const chartH = level === 0 ? 215 : level === 1 ? 185 : 160;
  const D = useMemo(() => inRange(toPoints(B.series || []), '1y'), [B.series]);
  const c = useMemo(() => chartModel(D, '1y', 430, chartH, true), [D, chartH]);
  const markets = marketRows(B);
  const rundown = rundownOf(B).slice(0, level >= 5 ? 6 : 7);
  return (
    <div>
      <Masthead B={B} />
      <h1 className="mt-2 text-[18px] font-bold leading-snug text-slate-900">{B.headline}</h1>

      {(B.key?.length > 0 || c) && (
        <>
          <H2 sub="basis points · red = rates up">Rates</H2>
          <div className="grid grid-cols-[1fr_1.3fr] gap-4 items-start">
            <div>
              {B.key?.length > 0 && <RatesTable B={B} />}
              {B.econ && B.econ.length > 0 && (
                <div className="mt-1.5 space-y-0.5">
                  {B.econ.map(r => (
                    <p key={r.n} className="text-[10.5px] leading-snug text-slate-700">
                      <span className="text-slate-500">{r.n}</span>{' '}
                      <b className={`font-mono ${r.good == null ? 'text-slate-900' : r.good ? GREEN : RED}`}>{r.v}</b>
                      {r.d && <span className="text-slate-500"> ({r.d})</span>}
                    </p>
                  ))}
                </div>
              )}
            </div>
            {c && (
              <div>
                <p className="text-[9.5px] text-slate-500"><b className="text-slate-700">Treasury yields, past year:</b> <span className="font-mono">{c.moves}</span></p>
                <ChartSvg c={c} fixedHeight={false} print label="2-, 5- and 10-year Treasury yields, past year" />
                <p className="text-[9px] text-slate-500">Treasury par yields, daily · latest {B.ustDate}</p>
              </div>
            )}
          </div>
        </>
      )}

      {markets.length > 0 && (
        <>
          <H2 sub="close · day · 1 year">Markets</H2>
          <div className="grid gap-px overflow-hidden rounded border border-slate-200 bg-slate-200" style={{ gridTemplateColumns: `repeat(${Math.min(markets.length, 5)}, minmax(0, 1fr))` }}>
            {markets.slice(0, 5).map(t => <MarketCell key={t.n} t={t} clamp={level >= 3} />)}
          </div>
        </>
      )}

      {rundown.length > 0 && (
        <>
          <H2 sub="what matters this morning">The Rundown</H2>
          <ol className="space-y-[7px]">
            {rundown.map((t, i) => <RundownRow key={i} t={t} n={i + 1} clamp={level >= 4} />)}
          </ol>
        </>
      )}
    </div>
  );
}

function RundownRow({ t, n, clamp }: { t: RundownItem; n: number; clamp: boolean }) {
  return (
    <li className="flex gap-2">
      <span className="mt-[1px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-[#1E3A5F] text-[10px] font-bold text-white">{n}</span>
      <p className={`min-w-0 text-[11.5px] leading-[1.42] text-slate-700 ${clamp ? 'line-clamp-3' : ''}`}>
        {t.tag && <span className="mr-1.5 text-[8.5px] font-bold uppercase tracking-[0.08em] text-[#1E3A5F]">{t.tag}</span>}
        <b className="font-semibold text-slate-900">{t.h}</b>{' '}
        <span dangerouslySetInnerHTML={{ __html: safeHtml(t.p) }} />
      </p>
    </li>
  );
}

function MarketCell({ t, clamp }: { t: TapeRow; clamp: boolean }) {
  const cls = t.rate ? rateCls : stockCls;
  return (
    <div className="bg-white px-2 py-1.5">
      <p className={LABEL}>{t.n}</p>
      <p className="font-mono text-[13.5px] font-semibold leading-tight text-slate-900">{t.v}</p>
      <p className="font-mono text-[10px]">
        <Chg label="Day" text={t.ctext} cls={cls(t.c)} />
        <Chg label="1Y" text={t.ytext} cls={cls(t.y)} />
      </p>
      {t.why && <p className={`mt-0.5 text-[9.5px] leading-snug text-slate-700 ${clamp ? 'line-clamp-2' : ''}`}>{t.why}</p>}
    </div>
  );
}

function RatesTable({ B }: { B: Brief }) {
  const th = 'px-1.5 py-1 text-right text-[8.5px] font-semibold uppercase tracking-[0.05em] text-slate-500';
  const td = 'px-1.5 py-[3px] text-right font-mono text-[11px]';
  return (
    <table className="w-full border-collapse overflow-hidden rounded border border-slate-200">
      <thead className="bg-slate-50">
        <tr>
          <th className={`${th} !text-left`}>Rate</th><th className={th}>Now</th><th className={th}>1Y ago</th>
          <th className={`${th} border-l border-slate-200`}>Δ1M</th><th className={th}>Δ6M</th><th className={th}>Δ1Y</th>
        </tr>
      </thead>
      <tbody>
        {B.key.map(k => {
          const lv = rateLevels(B, k);
          return (
            <tr key={k.n} className="border-t border-slate-100">
              <td className="px-1.5 py-[3px] text-[11px] font-semibold leading-tight text-slate-900">
                {k.n.replace(' Treasury', ' UST')}
                {has(k.asof) && <span className="block text-[8.5px] font-normal text-slate-400">{k.asof}</span>}
              </td>
              <td className={`${td} font-bold text-slate-900`}>{k.cur != null ? `${k.cur.toFixed(2)}%` : ''}</td>
              <td className={`${td} text-slate-500`}>{lv[3] ?? ''}</td>
              {[k.d1m, k.d6m, k.d1y].map((v, i) => (
                <td key={'d' + i} className={`${td} font-semibold ${i === 0 ? 'border-l border-slate-200' : ''} ${rateCls(v)}`}>{v != null ? bp(v) : ''}</td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ── Page 2 · deep dive, calendar, freight ──────────────────────────────

function PageTwo({ B, level }: { B: Brief; level: number }) {
  const cal = splitCalendar(B.cal);
  const ahead = level >= 2 ? [] : datesAhead(cal.later);
  const sport = sportOf(B);
  return (
    <div>
      <Masthead B={B} />

      {B.dive && B.dive.title && <DivePrint d={B.dive} watch={level < 4} table={level < 5} />}

      {(cal.last.length > 0 || cal.next.length > 0) && (
        <>
          <H2 sub="last week vs expectations · this week">Economic calendar</H2>
          <div className="grid grid-cols-2 gap-4">
            <CalPrint title="Last week · released" rows={cal.last} released />
            <CalPrint title="This week · expected" rows={cal.next} />
          </div>
          {ahead.length > 0 && (
            <p className="mt-1 text-[10px] leading-snug text-slate-700">
              <b className="text-slate-900">Further out: </b>
              {ahead.map((g, i) => (
                <span key={g.d}>{i > 0 && <span className="mx-1 text-slate-300">·</span>}<b className="font-semibold">{shortDay(g.d)}</b> {g.items.map(x => x.e).join('; ')}</span>
              ))}
            </p>
          )}
        </>
      )}

      {(B.freight?.length > 0 || has(B.also)) && (
        <>
          <H2>Freight &amp; supply chain</H2>
          {B.freight?.length > 0 && (
            <table className="w-full border-collapse">
              <tbody>
                {B.freight.map(f => (
                  <tr key={f.n} className="border-b border-slate-100 align-top">
                    <td className="w-[24%] py-[3px] pr-2 text-[10.5px] font-semibold leading-snug text-slate-900">{f.n}</td>
                    <td className="py-[3px] pr-2 text-right font-mono text-[11px] font-semibold whitespace-nowrap text-slate-900">{f.v}</td>
                    <td className="py-[3px] pr-2 text-right font-mono text-[10px] whitespace-nowrap text-slate-600">
                      {has(f.pc) && <>{f.pc} <span className="font-sans text-[8.5px] text-slate-400">{f.pl}</span></>}
                      {has(f.y) && <span className="block">{f.y} <span className="font-sans text-[8.5px] text-slate-400">1Y</span></span>}
                    </td>
                    <td className="py-[3px] text-[10px] leading-snug text-slate-700"><div className={level >= 3 ? 'line-clamp-1' : level >= 1 ? 'line-clamp-2' : ''}>{f.why}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {has(B.also) && (
            <p className="mt-1 text-[10px] leading-snug text-slate-600">
              <b className="text-slate-900">Also: </b><span dangerouslySetInnerHTML={{ __html: safeHtml(B.also) }} />
            </p>
          )}
        </>
      )}

      {has(sport) && (
        <p className="mt-3 border-t border-slate-200 pt-1.5 text-[10.5px] leading-snug text-slate-700">
          <b className="mr-1.5 text-[9px] uppercase tracking-[0.1em] text-[#1E3A5F]">Sports</b>
          <span dangerouslySetInnerHTML={{ __html: safeHtml(sport) }} />
        </p>
      )}
    </div>
  );
}

function DivePrint({ d, watch, table }: { d: DeepDive; watch: boolean; table: boolean }) {
  return (
    <>
      <H2 sub={d.kicker}>Deep dive</H2>
      <h3 className="text-[16px] font-bold leading-snug text-slate-900">{d.title}</h3>
      {d.dek && <p className="text-[11px] italic leading-snug text-slate-600">{d.dek}</p>}
      <div className="mt-1.5 space-y-1.5">
        {d.body.map((p, i) => <p key={i} className="text-[11.5px] leading-[1.45] text-slate-800" dangerouslySetInnerHTML={{ __html: safeHtml(p) }} />)}
      </div>
      {((table && d.table && d.table.rows.length > 0) || (watch && d.watch && d.watch.length > 0)) && (
        <div className="mt-2 grid grid-cols-2 gap-4 items-start">
          {table && d.table && d.table.rows.length > 0 ? (
            <div>
              {d.table.cap && <p className="mb-0.5 text-[9.5px] font-bold text-slate-700">{d.table.cap}</p>}
              <table className="w-full border-collapse">
                <thead><tr className="border-b border-slate-200">{d.table.cols.map((c, i) => <th key={i} className={`py-[2px] text-[8.5px] font-semibold uppercase tracking-[0.05em] text-slate-500 ${i ? 'text-right' : 'text-left'}`}>{c}</th>)}</tr></thead>
                <tbody>
                  {d.table.rows.map((r, i) => (
                    <tr key={i} className="border-b border-slate-100">{r.map((c, j) => <td key={j} className={`py-[2px] text-[10px] ${j ? 'text-right font-mono' : 'font-semibold text-slate-900'}`}>{c}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div />}
          {watch && d.watch && d.watch.length > 0 ? (
            <div className="rounded bg-slate-50 px-2.5 py-1.5">
              <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#1E3A5F]">What to watch</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-3.5 text-[10.5px] leading-snug text-slate-700">
                {d.watch.map((w, i) => <li key={i} dangerouslySetInnerHTML={{ __html: safeHtml(w) }} />)}
              </ul>
            </div>
          ) : <div />}
        </div>
      )}
    </>
  );
}

function CalPrint({ title, rows, released }: { title: string; rows: CalItem[]; released?: boolean }) {
  const th = 'py-[2px] text-[8.5px] font-semibold uppercase tracking-[0.05em] text-slate-500';
  return (
    <div>
      <p className="mb-0.5 text-[10px] font-bold text-slate-700">{title}</p>
      {rows.length === 0 ? <p className="text-[10px] text-slate-400">Nothing scheduled.</p> : (
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-200">
              <th className={`${th} text-left`}>Release</th>
              {released && <th className={`${th} text-right`}>Actual</th>}
              <th className={`${th} text-right`}>Exp.</th>
              <th className={`${th} text-right`}>Prior</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i, k) => {
              const event = !has(i.act) && !has(i.cons) && !has(i.prior);
              return (
              <tr key={k} className="border-b border-slate-100 align-top">
                <td className="py-[2px] pr-1 text-[10px] leading-snug text-slate-900">
                  <span className="text-[8.5px] font-semibold text-slate-500">{dayLabel(i.d).replace(/,.*/, '')} </span>
                  <span className="font-semibold">{i.e}</span>
                </td>
                {event ? <td colSpan={released ? 3 : 2} className="py-[2px] pl-1 text-right text-[9px] italic leading-snug text-slate-600">{i.why}</td> : <>
                {released && <td className={`py-[2px] pl-1 text-right font-mono text-[10px] font-bold whitespace-nowrap ${i.good == null ? 'text-slate-900' : i.good ? GREEN : RED}`}>{has(i.act) ? i.act : ''}</td>}
                <td className="py-[2px] pl-1 text-right font-mono text-[10px] whitespace-nowrap text-slate-600">{has(i.cons) ? i.cons : ''}</td>
                <td className="py-[2px] pl-1 text-right font-mono text-[10px] whitespace-nowrap text-slate-500">{has(i.prior) ? i.prior : ''}</td>
                </>}
              </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Page 3 · Investor's Corner ─────────────────────────────────────────

function PageThree({ B, r, level }: { B: Brief; r: Reading; level: number }) {
  return (
    <div>
      <Masthead B={B} />
      <H2 sub={[r.kind, r.who].filter(Boolean).join(' · ')}>Investor&apos;s Corner</H2>
      <h3 className="text-[17px] font-bold leading-snug text-slate-900">{r.title}</h3>
      {r.dek && <p className="text-[11.5px] italic leading-snug text-slate-600">{r.dek}</p>}
      {r.quote && level < 2 && (
        <blockquote className="my-2 border-l-[3px] border-[#1E3A5F] pl-3">
          <p className="font-serif text-[13px] italic leading-snug text-slate-800">“{r.quote.text}”</p>
          <p className="mt-0.5 text-[9.5px] text-slate-500">{r.quote.src}</p>
        </blockquote>
      )}
      <div className="mt-1.5 space-y-1.5">
        {r.body.map((p, i) => <p key={i} className="text-[11.5px] leading-[1.5] text-slate-800" dangerouslySetInnerHTML={{ __html: safeHtml(p) }} />)}
      </div>
      {level < 1 && r.takeaways && r.takeaways.length > 0 && (
        <div className="mt-2.5 rounded bg-slate-50 px-3 py-2">
          <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-[#1E3A5F]">For today&apos;s investor</p>
          <ul className="mt-0.5 list-disc space-y-0.5 pl-3.5 text-[10.5px] leading-snug text-slate-700">
            {r.takeaways.map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: safeHtml(t) }} />)}
          </ul>
        </div>
      )}
      {r.src && <p className="mt-2 text-[9.5px] text-slate-500">{r.src}</p>}
    </div>
  );
}
