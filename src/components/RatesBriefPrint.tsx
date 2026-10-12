'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RatesBrief as Brief, TapeRow, KeyRate, has, safeHtml } from '@/lib/rates-brief';
import { toPoints, inRange, chartModel, bp } from '@/lib/rates-chart';
import { ChartSvg } from './RatesBrief';

// Two-page Letter printout of the Rates Brief, laid out at a fixed sheet size (not the
// screen's responsive layout) and kept off-screen until printing.
//
// Priorities: legibility, then information, then looks. Type is set at a readable size
// and never shrinks below it (MIN_SCALE = 1); a light day scales up to fill the page. When
// a day has more than fits, content is trimmed instead, least important first:
//   page 1: a shorter chart, then the shortest chart; only then market notes to 4, 3, 2 lines
//   page 2: source notes to 3 lines; sector notes to 2 lines; freight notes to 4 lines;
//           then the lowest headlines, two (one row) at a time, down to 4

const MIN_SCALE = 1;
const MAX_SCALE = 1.3;

// Light-only colors (the printout is always on white paper).
const RED = 'text-[#B42318]', GREEN = 'text-[#067647]', GRAY = 'text-slate-500';
const rateCls = (x: number | null | undefined) => (x == null || x === 0 ? GRAY : x > 0 ? RED : GREEN);
const stockCls = (x: number | null | undefined) => (x == null || x === 0 ? GRAY : x > 0 ? GREEN : RED);
const MINUS = '−';
const pct = (x: number, d = 2) => `${x > 0 ? '+' : x < 0 ? MINUS : ''}${Math.abs(x).toFixed(d)}%`;
const money = (p: number) => '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const PRINT_CSS = `
@page { size: letter; margin: 0.4in; }
.rbp-root { position: fixed; left: -10000px; top: 0; visibility: hidden; pointer-events: none; }
.rbp-sheet { width: 7.7in; height: 10.15in; position: relative; overflow: hidden; background: #fff; color: #0f172a;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rbp-sheet + .rbp-sheet { break-before: page; }
.rbp-body { position: absolute; left: 0; right: 0; top: 0; bottom: 0.26in; overflow: hidden; }
.rbp-fit { transform-origin: top left; }
@media print {
  .rbp-root { position: static; visibility: visible; }
  html, body { background: #fff !important; }
}
`;

export default function RatesBriefPrint({ data: B }: { data: Brief }) {
  const newsAll = B.news?.length ?? 0;
  const [p1Level, setP1Level] = useState(0);
  const [p2Level, setP2Level] = useState(0);
  useEffect(() => { setP1Level(0); setP2Level(0); }, [B]);

  // Print light even when the CRM is in dark mode.
  useEffect(() => {
    let wasDark = false;
    const before = () => { wasDark = document.documentElement.classList.contains('dark'); document.documentElement.classList.remove('dark'); };
    const after = () => { if (wasDark) document.documentElement.classList.add('dark'); };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => { window.removeEventListener('beforeprint', before); window.removeEventListener('afterprint', after); };
  }, []);

  const P1_MAX = 5;
  const p2Max = 3 + Math.max(0, Math.ceil((newsAll - 4) / 2));
  const onOverflow1 = useCallback(() => setP1Level(l => Math.min(l + 1, P1_MAX)), []);
  const onOverflow2 = useCallback(() => setP2Level(l => Math.min(l + 1, p2Max)), [p2Max]);
  const newsMax = p2Level <= 3 ? newsAll : Math.max(Math.min(4, newsAll), newsAll - 2 * (p2Level - 3));
  const datelineShort = (B.dateline || '').split('·')[0].trim();

  return (
    <div className="rbp-root" aria-hidden>
      <style>{PRINT_CSS}</style>
      <Sheet page={1} footer={datelineShort} onOverflow={onOverflow1} deps={[B, p1Level]}>
        <PageOne B={B} level={p1Level} />
      </Sheet>
      <Sheet page={2} footer={datelineShort} onOverflow={onOverflow2} deps={[B, p2Level]}>
        <PageTwo B={B} newsMax={newsMax} footClamp={p2Level >= 1} spotClamp={p2Level >= 2} freightClamp={p2Level >= 3} />
      </Sheet>
    </div>
  );
}

// A page-sized sheet that scales its content up to fill the page (never below MIN_SCALE).
function Sheet({ page, footer, onOverflow, deps, children }: {
  page: number; footer: string; onOverflow: () => void; deps: unknown[]; children: React.ReactNode;
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
    let lo = MIN_SCALE, hi = MAX_SCALE, best = MIN_SCALE;
    for (let i = 0; i < 16; i++) {
      const s = (lo + hi) / 2;
      if (heightAt(s) <= H) { best = s; lo = s; } else hi = s;
    }
    f.style.width = `${W / best}px`;
    f.style.transform = `scale(${best})`;
    f.dataset.scale = best.toFixed(3);
  }, [onOverflow]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { doFit(); }, [doFit, ...deps]);
  useEffect(() => {
    document.fonts?.ready.then(doFit).catch(() => {});
    window.addEventListener('beforeprint', doFit);
    return () => window.removeEventListener('beforeprint', doFit);
  }, [doFit]);

  return (
    <div className="rbp-sheet">
      <div ref={body} className="rbp-body">
        <div ref={fit} className="rbp-fit">{children}</div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 flex justify-between border-t border-slate-200 pt-1 text-[9px] text-slate-400">
        <span>Sandpiper Capital LLC · Rates Brief{footer ? ` · ${footer}` : ''}</span>
        <span>Page {page} of 2</span>
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

const SPAN: Record<number, string> = { 1: 'col-span-12', 2: 'col-span-6', 3: 'col-span-4' };
const LABEL = 'text-[9px] font-semibold uppercase tracking-[0.08em] text-slate-500';

function Masthead({ B, compact }: { B: Brief; compact?: boolean }) {
  return (
    <div className="border-b-2 border-[#1E3A5F] pb-2">
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-[9.5px] font-bold uppercase tracking-[0.18em] text-[#1E3A5F]">Sandpiper <span className="text-slate-900">· Rates Brief</span></p>
        <p className="text-right text-[10.5px] text-slate-600">{B.dateline}</p>
      </div>
      {!compact && <h1 className="mt-1 text-[19px] font-bold leading-[1.25] text-slate-900">{B.headline}</h1>}
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

function PageOne({ B, level }: { B: Brief; level: number }) {
  const clamp = level <= 2 ? '' : level === 3 ? 'line-clamp-4' : level === 4 ? 'line-clamp-3' : 'line-clamp-2';
  const chartH = level === 0 ? 245 : level === 1 ? 200 : 165;
  const D = useMemo(() => inRange(toPoints(B.series || []), '1y'), [B.series]);
  const c = useMemo(() => chartModel(D, '1y', 720, chartH, false), [D, chartH]);
  return (
    <div>
      <Masthead B={B} />

      {B.top && B.top.length > 0 && (
        <>
          <H2>Top 5 today</H2>
          <ol className="space-y-1.5">
            {B.top.slice(0, 5).map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-[1px] flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full bg-[#1E3A5F] text-[10px] font-bold text-white">{i + 1}</span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold leading-snug text-slate-900">
                    {t.tag && <span className="mr-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#1E3A5F]">{t.tag}</span>}
                    {t.h}
                  </p>
                  {t.p && <p className="text-[11px] leading-snug text-slate-700">{t.p}</p>}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {B.tape?.length > 0 && (
        <>
          <H2 sub="close · day change · 1-year change">Markets</H2>
          {/* 4 per row; a short last row widens to fill it instead of leaving empty cells. */}
          <div className="grid grid-cols-12 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200">
            {B.tape.map((t, i) => {
              const rem = B.tape.length % 4;
              const span = rem && i >= B.tape.length - rem ? SPAN[rem] : 'col-span-3';
              return <div key={t.n} className={span}><TapeCell t={t} clamp={clamp} /></div>;
            })}
          </div>
        </>
      )}

      {B.key?.length > 0 && (
        <>
          <H2 sub="levels and changes in basis points · red = rates up">Key rates</H2>
          <RatesTable B={B} />
        </>
      )}

      {c && (
        <>
          <H2 sub={`past year: ${c.moves}`}>Treasury yields · 2Y / 5Y / 10Y</H2>
          <ChartSvg c={c} fixedHeight={false} print label="2-, 5- and 10-year Treasury yields, past year" />
          <p className="mt-0.5 text-[9px] text-slate-500">Source: U.S. Department of the Treasury, daily par yield curve. Latest: {B.ustDate || 'n/a'}.</p>
        </>
      )}
    </div>
  );
}

function TapeCell({ t, clamp }: { t: TapeRow; clamp: string }) {
  const cls = t.rate ? rateCls : stockCls;
  return (
    <div className="h-full bg-white px-2.5 py-2">
      <p className={LABEL}>{t.n}{t.asof && <span className="ml-1 font-normal normal-case tracking-normal">as of {t.asof}</span>}</p>
      <p className="font-mono text-[15px] font-semibold leading-tight text-slate-900">{has(t.v) ? t.v : 'n/a'}</p>
      <p className="font-mono text-[10.5px]"><Chg label="Day" text={t.ctext} cls={cls(t.c)} /><Chg label="1Y" text={t.ytext} cls={cls(t.y)} /></p>
      {t.why && <p className={`mt-1 text-[10.5px] leading-snug text-slate-700 ${clamp}`}>{t.why}</p>}
    </div>
  );
}

// Key rates as a table: the level now and 1M / 6M / 1Y ago (from the brief's rate table
// when present), plus the changes in bp.
function RatesTable({ B }: { B: Brief }) {
  const rtab = (B.rtab || []) as { n?: string; v?: string[] }[];
  const levels = (k: KeyRate): (string | null)[] => {
    const tok = k.n.split(' ')[0];
    const row = rtab.find(r => r.n && r.v && r.n.split(' ')[0] === tok);
    return row?.v ? [0, 1, 2, 3].map(i => row.v?.[i] ?? null) : [k.cur != null ? k.cur.toFixed(2) : null, null, null, null];
  };
  const th = 'px-2 py-1 text-right text-[9px] font-semibold uppercase tracking-[0.06em] text-slate-500';
  const td = 'px-2 py-1 text-right font-mono text-[11.5px]';
  return (
    <table className="w-full border-collapse overflow-hidden rounded border border-slate-200">
      <thead className="bg-slate-50">
        <tr>
          <th className={`${th} !text-left`}>Rate</th>
          <th className={th}>Now</th><th className={th}>1M ago</th><th className={th}>6M ago</th><th className={th}>1Y ago</th>
          <th className={`${th} border-l border-slate-200`}>Δ1M</th><th className={th}>Δ6M</th><th className={th}>Δ1Y</th>
          <th className={th}>As of</th>
        </tr>
      </thead>
      <tbody>
        {B.key.map(k => {
          const lv = levels(k);
          return (
            <tr key={k.n} className="border-t border-slate-100">
              <td className="px-2 py-1 text-[11.5px] font-semibold text-slate-900">{k.n}</td>
              <td className={`${td} font-bold text-slate-900`}>{k.cur != null ? `${k.cur.toFixed(2)}%` : 'n/a'}</td>
              {[lv[1], lv[2], lv[3]].map((v, i) => <td key={i} className={`${td} text-slate-600`}>{v ?? '—'}</td>)}
              {[k.d1m, k.d6m, k.d1y].map((v, i) => (
                <td key={'d' + i} className={`${td} font-semibold ${i === 0 ? 'border-l border-slate-200' : ''} ${v != null ? rateCls(v) : GRAY}`}>{v != null ? bp(v) : 'n/a'}</td>
              ))}
              <td className={`${td} font-sans text-[10px] text-slate-500`}>{has(k.asof) ? k.asof : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PageTwo({ B, newsMax, footClamp, spotClamp, freightClamp }: { B: Brief; newsMax: number; footClamp: boolean; spotClamp: boolean; freightClamp: boolean }) {
  const news = (B.news || []).slice(0, newsMax);
  const dropped = (B.news?.length ?? 0) - news.length;
  return (
    <div>
      <Masthead B={B} compact />

      <H2>FHLB Topeka</H2>
      <p className="rounded border border-dashed border-slate-300 px-2.5 py-1.5 text-[11px] leading-snug text-slate-700 [&_b]:text-slate-900"
        dangerouslySetInnerHTML={{ __html: safeHtml(B.fhlb) || 'n/a' }} />

      {(B.freight?.length > 0 || has(B.also)) && (
        <>
          <H2 sub="this week's releases">Freight &amp; supply chain</H2>
          {B.freight?.length > 0 && (
            <div className="grid grid-cols-4 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200">
              {B.freight.map(f => (
                <div key={f.n} className="bg-white px-2.5 py-2">
                  <p className={LABEL}>{f.n}</p>
                  <p className="font-mono text-[15px] font-semibold leading-tight text-slate-900">{has(f.v) ? f.v : 'n/a'}</p>
                  <p className="font-mono text-[10.5px]"><Chg label={f.pl || 'Chg'} text={f.pc} cls="text-slate-700" /><Chg label="1Y" text={f.y} cls="text-slate-700" /></p>
                  {f.why && <p className={`mt-1 text-[10.5px] leading-snug text-slate-700 ${freightClamp ? 'line-clamp-4' : ''}`}>{f.why}</p>}
                </div>
              ))}
              {Array.from({ length: (4 - (B.freight.length % 4)) % 4 }, (_, i) => <div key={'pad' + i} className="bg-white" />)}
            </div>
          )}
          {has(B.also) && (
            <p className="mt-1.5 text-[10.5px] leading-snug text-slate-600">
              <b className="text-slate-900">Also on the board: </b><span dangerouslySetInnerHTML={{ __html: safeHtml(B.also) }} />
            </p>
          )}
        </>
      )}

      {B.spot && (
        <>
          <H2 sub={[B.rota?.find(r => r.on)?.d, B.spot.g].filter(Boolean).join(' · ')}>Sector spotlight</H2>
          <div className="divide-y divide-slate-100 border-y border-slate-200">
            {(B.spot.rows || []).map(r => (
              <div key={r.t} className="py-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[12px] font-semibold text-slate-900">{r.n}<span className="ml-1.5 font-mono text-[10px] font-normal text-slate-500">{r.t}</span></p>
                  <p className="whitespace-nowrap font-mono text-[11px]">
                    <span className="mr-3 font-semibold text-slate-900">{r.p != null ? money(r.p) : 'close n/a'}</span>
                    <span className="mr-3"><span className="font-sans text-[9px] font-semibold text-slate-400">DAY </span><span className={`font-semibold ${r.c != null ? stockCls(r.c) : GRAY}`}>{r.c != null ? pct(r.c) : 'n/a'}</span></span>
                    <span><span className="font-sans text-[9px] font-semibold text-slate-400">1Y </span><span className={`font-semibold ${r.y != null ? stockCls(r.y) : GRAY}`}>{r.y != null ? pct(r.y, 1) : 'n/a'}</span></span>
                  </p>
                </div>
                {r.u && <p className={`text-[10.5px] leading-snug text-slate-700 ${spotClamp ? 'line-clamp-2' : ''}`}>{r.u}</p>}
              </div>
            ))}
          </div>
          {B.board && B.board.length > 0 && (
            <table className="mt-1.5 w-full text-[10px]">
              <tbody>
                {B.board.map(g => g.rows.map((r, i) => (
                  <tr key={g.g + r.t} className="border-b border-slate-100">
                    <td className="py-[2px] text-slate-500">{i === 0 ? g.g : ''}</td>
                    <td className="py-[2px]">{r.n} <span className="font-mono text-slate-400">{r.t}</span></td>
                    <td className="py-[2px] text-right font-mono">{money(r.p)}</td>
                    <td className={`py-[2px] text-right font-mono ${stockCls(r.c)}`}>{r.c != null ? pct(r.c) : ''}</td>
                  </tr>
                )))}
              </tbody>
            </table>
          )}
        </>
      )}

      {news.length > 0 && (
        <>
          <H2 sub={dropped > 0 ? `top ${news.length} of ${news.length + dropped}; all ${news.length + dropped} are on the CRM tab` : undefined}>What&apos;s moving</H2>
          <div className="grid grid-cols-2 gap-x-5">
            {news.map((n, i) => (
              <div key={i} className="border-t border-slate-100 py-1.5">
                <p className="text-[12px] font-semibold leading-snug text-slate-900">
                  <span className="mr-1.5 text-[9px] font-bold uppercase tracking-[0.08em] text-[#1E3A5F]">{n.tag}</span>{n.h}
                </p>
                {n.p && <p className="text-[10.5px] leading-snug text-slate-700">{n.p}</p>}
                {n.src && <p className="text-[9px] text-slate-500">{n.src}</p>}
              </div>
            ))}
          </div>
        </>
      )}

      {B.sports && B.sports.length > 0 && (
        <>
          <H2>Sports</H2>
          <div className="grid grid-cols-3 gap-2">
            {B.sports.map((s, i) => (
              <div key={i}>
                <p className={LABEL}>{s.lg} · {s.d}</p>
                <p className="text-[11px] font-semibold">{s.h}</p>
                <p className="text-[10px] text-slate-700">{s.p}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {has(B.foot) && (
        <>
          <p className={`mt-3 border-t border-slate-200 pt-1.5 text-[9px] leading-snug text-slate-500 ${footClamp ? 'line-clamp-3' : ''}`} dangerouslySetInnerHTML={{ __html: safeHtml(B.foot) }} />
          {footClamp && <p className="text-[9px] italic text-slate-400">Full sources and notes are on the CRM Rates Brief tab.</p>}
        </>
      )}
    </div>
  );
}
