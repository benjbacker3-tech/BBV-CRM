'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RatesBrief as Brief, TapeRow, CalItem, has, safeHtml, marketRows, rateLevels, splitCalendar } from '@/lib/rates-brief';
import { toPoints, inRange, chartModel, bp } from '@/lib/rates-chart';
import { ChartSvg, datesAhead, dayLabel } from './RatesBrief';

// Two-page Letter printout of the Sandpiper Daily Brief, laid out like a daily intelligence
// brief: headline first, key judgments, then short sections, each figure shown once.
//   Page 1 · the economy and the cost of capital: headline, Top 5, economic calendar
//            (last week's releases vs expectations | this week's), rates & credit
//            (table, standing readings, chart beside a markets list).
//   Page 2 · what's coming and tenant demand: coming up (Fed, releases, earnings 1–3 weeks out),
//            freight, sector spotlight, what's moving. No sources section (personal brief).
// The sheets are a fixed size (not the screen's responsive layout) and kept off-screen until
// printing. Type never shrinks below its set size (MIN_SCALE = 1); a light day scales up to
// fill the page. A heavy day is trimmed instead, least useful first:
//   page 1: shorter chart, then shortest; calendar notes off; Top 5 notes to 1 line
//   page 2: coming-up explanations off; sector notes 2 lines; freight notes 3 lines;
//           then the lowest headlines, two at a time, down to 4

const MIN_SCALE = 1;
const MAX_SCALE = 1.3;
const NAVY = '#1E3A5F';

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
  // Trims only ever step up, so whenever the content or the fonts change, start the fit over.
  // Bumping `epoch` makes both sheets measure again even when a level was already 0.
  const [epoch, setEpoch] = useState(0);
  const restart = useCallback(() => { setP1Level(0); setP2Level(0); setEpoch(e => e + 1); }, []);
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

  const P1_MAX = 4;
  const P2_FIXED = 3;
  const p2Max = P2_FIXED + Math.max(0, Math.ceil((newsAll - 4) / 2));
  const onOverflow1 = useCallback(() => setP1Level(l => Math.min(l + 1, P1_MAX)), []);
  const onOverflow2 = useCallback(() => setP2Level(l => Math.min(l + 1, p2Max)), [p2Max]);
  const newsMax = p2Level <= P2_FIXED ? newsAll : Math.max(Math.min(4, newsAll), newsAll - 2 * (p2Level - P2_FIXED));
  const datelineShort = (B.dateline || '').split('·')[0].trim();

  return (
    <div className="rbp-root" aria-hidden>
      <style>{PRINT_CSS}</style>
      <Sheet page={1} footer={datelineShort} onOverflow={onOverflow1} deps={[B, p1Level, epoch]}>
        <PageOne B={B} level={p1Level} />
      </Sheet>
      <Sheet page={2} footer={datelineShort} onOverflow={onOverflow2} deps={[B, p2Level, epoch]}>
        <PageTwo B={B} newsMax={newsMax} calWhy={p2Level < 1} spotClamp={p2Level >= 2} freightClamp={p2Level >= 3} />
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

// ── Page 1 · economy and cost of capital ───────────────────────────────

function PageOne({ B, level }: { B: Brief; level: number }) {
  const chartH = level === 0 ? 235 : level === 1 ? 200 : 170;
  const calNotes = level < 3;
  const cal = splitCalendar(B.cal);
  const topClamp = level >= 4 ? 'line-clamp-1' : '';
  const D = useMemo(() => inRange(toPoints(B.series || []), '1y'), [B.series]);
  const c = useMemo(() => chartModel(D, '1y', 470, chartH, true), [D, chartH]);
  const markets = marketRows(B);
  return (
    <div>
      <Masthead B={B} />

      <h1 className="mt-2 text-[18px] font-bold leading-snug text-slate-900">{B.headline}</h1>

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
                  {t.p && <p className={`text-[11px] leading-snug text-slate-700 ${topClamp}`}>{t.p}</p>}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      {(cal.last.length > 0 || cal.next.length > 0) && (
        <>
          <H2 sub="last week's releases vs expectations · what's due this week">Economic calendar</H2>
          <div className="grid grid-cols-2 gap-4">
            <CalPrint title="Last week · released" rows={cal.last} released notes={calNotes} />
            <CalPrint title="This week · expected" rows={cal.next} notes={calNotes} />
          </div>
        </>
      )}

      {B.key?.length > 0 && (
        <>
          <H2 sub="levels and changes in basis points · red = rates up">Rates &amp; credit</H2>
          <RatesTable B={B} />
          {B.econ && B.econ.length > 0 && (
            <p className="mt-1 text-[10.5px] text-slate-700">
              {B.econ.map((r, i) => (
                <span key={r.n} className="whitespace-nowrap">
                  {i > 0 && <span className="mx-1.5 text-slate-300">·</span>}
                  <span className="text-slate-500">{r.n}</span> <b className={`font-mono ${r.good == null ? 'text-slate-900' : r.good ? GREEN : RED}`}>{has(r.v) ? r.v : 'n/a'}</b>
                  {r.d && <span className="text-slate-500"> ({r.d})</span>}
                </span>
              ))}
            </p>
          )}
        </>
      )}
      {(c || markets.length > 0) && (
        <div className="mt-2 grid grid-cols-[1.7fr_1fr] gap-4">
          {c ? (
            <div>
              <p className="text-[9.5px] text-slate-500"><b className="text-slate-700">Treasury yields, past year:</b> <span className="font-mono">{c.moves}</span></p>
              <ChartSvg c={c} fixedHeight={false} print label="2-, 5- and 10-year Treasury yields, past year" />
              <p className="text-[9px] text-slate-500">Treasury par yields, daily · latest {B.ustDate}</p>
            </div>
          ) : <div />}
          {markets.length > 0 && (
            <div>
              <p className="mb-1 border-b border-slate-200 pb-0.5 text-[9.5px] font-bold uppercase tracking-[0.1em] text-[#1E3A5F]">Markets <span className="font-medium normal-case tracking-normal text-slate-500">close · day · 1Y</span></p>
              <table className="w-full border-collapse">
                <tbody>{markets.map(t => <MarketRow key={t.n} t={t} />)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CalPrint({ title, rows, released, notes }: { title: string; rows: CalItem[]; released?: boolean; notes: boolean }) {
  const th = 'py-[3px] text-[8.5px] font-semibold uppercase tracking-[0.05em] text-slate-500';
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
                <td className="py-[3px] pr-1 text-[10.5px] leading-snug text-slate-900">
                  <span className="text-[9px] font-semibold text-slate-500">{dayLabel(i.d).replace(/,.*/, '')} </span>
                  <span className="font-semibold">{i.e}</span>
                  {!event && notes && i.why && <span className="block text-[9.5px] text-slate-600">{i.why}</span>}
                </td>
                {event ? <td colSpan={released ? 3 : 2} className="py-[3px] pl-1 text-right text-[9.5px] italic text-slate-600">{i.why}</td> : <>
                {released && <td className={`py-[3px] pl-1 text-right font-mono text-[10.5px] font-bold whitespace-nowrap ${i.good == null ? 'text-slate-900' : i.good ? GREEN : RED}`}>{has(i.act) ? i.act : '—'}</td>}
                <td className="py-[3px] pl-1 text-right font-mono text-[10px] whitespace-nowrap text-slate-600">{has(i.cons) ? i.cons : '—'}</td>
                <td className="py-[3px] pl-1 text-right font-mono text-[10px] whitespace-nowrap text-slate-500">{has(i.prior) ? i.prior : '—'}</td>
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

function MarketRow({ t }: { t: TapeRow }) {
  const cls = t.rate ? rateCls : stockCls;
  return (
    <tr className="border-b border-slate-100">
      <td className="py-[3px] pr-1 text-[10.5px] font-semibold text-slate-900">{t.n}</td>
      <td className="py-[3px] pr-1 text-right font-mono text-[11px] font-semibold text-slate-900">{has(t.v) ? t.v : 'n/a'}</td>
      <td className={`py-[3px] pr-1 text-right font-mono text-[10.5px] font-semibold ${has(t.ctext) ? cls(t.c) : GRAY}`}>{has(t.ctext) ? t.ctext : '—'}</td>
      <td className={`py-[3px] text-right font-mono text-[10.5px] font-semibold ${has(t.ytext) ? cls(t.y) : GRAY}`}>{has(t.ytext) ? t.ytext : '—'}</td>
    </tr>
  );
}

function RatesTable({ B }: { B: Brief }) {
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
          const lv = rateLevels(B, k);
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

// ── Page 2 · what's coming and tenant demand ───────────────────────────

function PageTwo({ B, newsMax, calWhy, spotClamp, freightClamp }: {
  B: Brief; newsMax: number; calWhy: boolean; spotClamp: boolean; freightClamp: boolean;
}) {
  const news = (B.news || []).slice(0, newsMax);
  const dropped = (B.news?.length ?? 0) - news.length;
  const week = datesAhead(splitCalendar(B.cal).later);
  return (
    <div>
      <Masthead B={B} />

      {week.length > 0 && (
        <>
          <H2 sub="Fed, releases and earnings one to three weeks out">Coming up</H2>
          <div className="columns-2 gap-5">
            {week.map(g => (
              <div key={g.d} className="grid break-inside-avoid grid-cols-[66px_1fr] gap-2 border-t border-slate-100 py-1">
                <p className="text-[10.5px] font-bold leading-snug text-slate-900">{dayLabel(g.d)}</p>
                <div className="space-y-0.5">
                  {g.items.map((i, k) => (
                    <p key={k} className="text-[10.5px] leading-snug text-slate-800">
                      {i.tag && (
                        <span className={`mr-1.5 text-[9px] font-bold uppercase tracking-[0.06em] text-[#1E3A5F]`}>{i.tag}</span>
                      )}
                      <span className="font-semibold">{i.e}</span>
                      {calWhy && i.why && <span className="text-slate-600"> — {i.why}</span>}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {(B.freight?.length > 0 || has(B.also)) && (
        <>
          <H2 sub="this week's releases">Freight &amp; supply chain</H2>
          {B.freight?.length > 0 && (
            <div className="grid grid-cols-4 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200">
              {B.freight.map(f => (
                <div key={f.n} className="bg-white px-2.5 py-2">
                  <p className={LABEL}>{f.n}</p>
                  <p className="font-mono text-[14px] font-semibold leading-tight text-slate-900">{has(f.v) ? f.v : 'n/a'}</p>
                  <p className="font-mono text-[10.5px]"><Chg label={f.pl || 'Chg'} text={f.pc} cls="text-slate-700" /><Chg label="1Y" text={f.y} cls="text-slate-700" /></p>
                  {f.why && <p className={`mt-1 text-[10.5px] leading-snug text-slate-700 ${freightClamp ? 'line-clamp-3' : ''}`}>{f.why}</p>}
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
                  <span className="mr-1.5 text-[9px] font-bold uppercase tracking-[0.08em]" style={{ color: NAVY }}>{n.tag}</span>{n.h}
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

    </div>
  );
}
