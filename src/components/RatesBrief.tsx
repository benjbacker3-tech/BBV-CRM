'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { RatesBrief as Brief, TapeRow, EconRow, CalItem, DeepDive, FocusItem, Reading, RundownItem, World, has, safeHtml, marketRows, rateLevels, splitCalendar, rundownOf, sportOf, list, paras } from '@/lib/rates-brief';
import { RANGES, Range, LINES, Line, ChartModel, toPoints, inRange, chartModel, bp } from '@/lib/rates-chart';
import RatesBriefPrint, { ChartInk, MiniLine, RealBars, TREND } from './RatesBriefPrint';
import type { MyDate } from '@/lib/my-dates';
import { fmt } from '@/lib/utils';

// Sandpiper Daily Brief, a morning investor update in a newsletter voice:
//   rates (SOFR, Treasuries, 10Y chart) and markets up top, then The Rundown (5–7 items),
//   the deep dive (one structural topic a day), a compact economic calendar, freight, sports,
//   Data in focus, World Desk, and Investor's Corner (a well-known investor's story or ideas).
//   In print: page 1 numbers and news, page 2 deep dive / focus / calendar, page 3 World Desk + Corner.
// Colors: for rates and diesel a rise is bad (red); for stocks a rise is good (green).
const UP_BAD = 'text-red-700 dark:text-red-400';
const UP_GOOD = 'text-emerald-700 dark:text-emerald-400';
const FLAT = 'text-slate-500 dark:text-slate-400';
const rateCls = (x: number | null | undefined) => (x == null || x === 0 ? FLAT : x > 0 ? UP_BAD : UP_GOOD);
const stockCls = (x: number | null | undefined) => (x == null || x === 0 ? FLAT : x > 0 ? UP_GOOD : UP_BAD);
export const econCls = (r: EconRow) => (r.good == null ? FLAT : r.good ? UP_GOOD : UP_BAD);
export const ARROW = { up: '▲', down: '▼', flat: '▬' } as const;

// The calendar's later dates (beyond this week), grouped by date.
export function datesAhead(later: CalItem[]): { d: string; items: CalItem[] }[] {
  const all = [...later];
  all.sort((a, b) => a.d.localeCompare(b.d));
  const out: { d: string; items: CalItem[] }[] = [];
  for (const i of all) { const g = out[out.length - 1]; if (g && g.d === i.d) g.items.push(i); else out.push({ d: i.d, items: [i] }); }
  return out;
}
export const dayLabel = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const shortDay = (iso: string) =>
  new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export default function RatesBrief({ data: B }: { data: Brief }) {
  const markets = marketRows(B);
  const cal = splitCalendar(B.cal);
  const ahead = datesAhead(cal.later);
  const rundown = rundownOf(B);
  const sport = sportOf(B);
  const focusItems = list<FocusItem>(B.focus?.items).filter(f => typeof f === 'object' && f.title);
  const dates = useMyDates();

  return (
    <>
    <div className="page !max-w-[1100px] !px-4 sm:!px-8 space-y-8 print:hidden">
      <header className="pb-4 border-b-2 border-navy dark:border-blue-300">
        <div className="flex items-start justify-between gap-3">
          <p className="eyebrow !text-navy dark:!text-blue-300 font-semibold">Sandpiper Daily Brief</p>
          <button onClick={() => window.print()} className="btn-secondary !py-1 shrink-0" title="Print a 3-page brief (Letter)">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-6a2 2 0 012-2h14a2 2 0 012 2v6a1 1 0 01-1 1h-2M6 14h12v7H6z" /></svg>
            Print
          </button>
        </div>
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 leading-snug [text-wrap:balance]">
          {B.headline || 'No brief yet'}
        </h1>
        {B.dateline && <p className="page-sub">{B.dateline}</p>}
      </header>

      {dates && <YourDates dates={dates} />}

      {(B.key?.length > 0 || B.series?.length > 1) && (
        <Section title="Rates" sub="basis points · red = rates up">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start">
            <div>
              {B.key?.length > 0 && <KeyRatesTable B={B} />}
              {B.econ && B.econ.length > 0 && <Standing rows={B.econ} />}
            </div>
            {B.series?.length > 1 && <YieldChart series={B.series} latest={B.ustDate} />}
          </div>
        </Section>
      )}

      {markets.length > 0 && (
        <Section title="Markets" sub="close · day · 1 year">
          <div className="grid grid-cols-1 min-[460px]:grid-cols-2 lg:grid-cols-5 gap-3">
            {markets.map(t => <MarketCard key={t.n} t={t} />)}
          </div>
        </Section>
      )}

      {rundown.length > 0 && <Rundown items={rundown.slice(0, 7)} />}

      {B.dive && B.dive.title && <Dive d={B.dive} />}

      {focusItems.length > 0 && <Focus items={focusItems} />}

      {(cal.last.length > 0 || cal.next.length > 0) && (
        <Section title="Economic calendar" sub="last week vs expectations · this week">
          <div className="grid gap-4 lg:grid-cols-2">
            <CalTable title="Last week · released" rows={cal.last} released />
            <CalTable title="This week · expected" rows={cal.next} />
          </div>
          {ahead.length > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-800 dark:text-slate-100">Further out: </span>
              {ahead.map((g, i) => (
                <span key={g.d}>{i > 0 && <span className="mx-1.5 text-slate-300">·</span>}<b className="font-semibold">{shortDay(g.d)}</b> {g.items.map(x => x.e).join('; ')}</span>
              ))}
            </p>
          )}
        </Section>
      )}

      {(B.freight?.length > 0 || has(B.also)) && (
        <Section title="Freight & supply chain">
          {B.freight?.length > 0 && (
            <div className="card overflow-x-auto">
              <table className="table-clean">
                <thead><tr><th>Measure</th><th className="!text-right">Latest</th><th className="!text-right">Change</th><th className="!text-right">1Y</th><th>What it says</th></tr></thead>
                <tbody>
                  {B.freight.map(f => (
                    <tr key={f.n} className="row align-top">
                      <td className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{f.n}</td>
                      <td className="num font-semibold text-slate-900 dark:text-slate-100 whitespace-nowrap">{f.v}</td>
                      <td className="num whitespace-nowrap text-slate-600 dark:text-slate-300">{has(f.pc) ? <>{f.pc} <span className="text-[10px] text-slate-400">{f.pl}</span></> : ''}</td>
                      <td className="num whitespace-nowrap text-slate-600 dark:text-slate-300">{has(f.y) ? f.y : ''}</td>
                      <td className="text-xs leading-snug text-slate-600 dark:text-slate-300 min-w-[220px]">{f.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {has(B.also) && (
            <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-slate-700 dark:text-slate-200">Also: </span>
              <span dangerouslySetInnerHTML={{ __html: safeHtml(B.also) }} />
            </p>
          )}
        </Section>
      )}

      {has(sport) && (
        <p className="border-t border-slate-200 dark:border-slate-800 pt-3 text-[13px] text-slate-600 dark:text-slate-300">
          <span className="mr-2 text-xs uppercase tracking-[0.12em] font-bold text-navy dark:text-blue-300">Sports</span>
          <span dangerouslySetInnerHTML={{ __html: safeHtml(sport) }} />
        </p>
      )}
      {B.world && B.world.lead && B.world.lead.title && <WorldDesk w={B.world} />}
      {B.reading && B.reading.title && <Corner r={B.reading} />}
    </div>
    <RatesBriefPrint data={B} dates={dates} />
    </>
  );
}

function Rundown({ items }: { items: RundownItem[] }) {
  return (
    <Section title="The Rundown" sub="what matters this morning">
      <ol className="space-y-4">
        {items.map((t, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-semibold text-white dark:bg-blue-300 dark:text-slate-900">{i + 1}</span>
            <div className="min-w-0 max-w-[78ch]">
              <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">
                {t.tag && <span className="mr-2 text-[10px] font-bold uppercase tracking-[0.1em] text-navy dark:text-blue-300">{t.tag}</span>}
                <b className="font-semibold text-slate-900 dark:text-slate-100">{t.h}</b>{' '}
                <span dangerouslySetInnerHTML={{ __html: safeHtml(t.p) }} />
                {t.url && (
                  <a href={t.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 whitespace-nowrap text-xs text-slate-400 hover:text-navy dark:hover:text-blue-300 underline underline-offset-2">
                    {t.src || 'source'}
                  </a>
                )}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function Corner({ r }: { r: Reading }) {
  return (
    <Section title="Investor's Corner" sub={[r.kind, r.who].filter(Boolean).join(' · ')}>
      <article className="card px-5 py-5 sm:px-7">
        <h3 className="text-lg sm:text-xl font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">{r.title}</h3>
        {r.dek && <p className="mt-1 text-sm italic text-slate-500 dark:text-slate-400">{r.dek}</p>}
        {r.quote && (
          <blockquote className="my-4 border-l-4 border-navy dark:border-blue-300 pl-4">
            <p className="font-serif text-lg italic leading-snug text-slate-800 dark:text-slate-200">“{r.quote.text}”</p>
            <p className="mt-1 text-xs text-slate-500">{r.quote.src}</p>
          </blockquote>
        )}
        <div className="mt-3 space-y-3 max-w-[78ch]">
          {paras(r.body).map((p, i) => <p key={i} className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: safeHtml(p) }} />)}
        </div>
        {list(r.takeaways).length > 0 && (
          <div className="mt-4 rounded-md bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-navy dark:text-blue-300">For today&apos;s investor</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[13px] text-slate-700 dark:text-slate-300">
              {list<string>(r.takeaways).map((t, i) => <li key={i} dangerouslySetInnerHTML={{ __html: safeHtml(t) }} />)}
            </ul>
          </div>
        )}
        {r.src && <p className="mt-3 text-[11px] text-slate-400">{r.src}</p>}
      </article>
    </Section>
  );
}

// Ben's own deadlines for the next 7 days, from the CRM (not part of the brief's JSON).
export function useMyDates(): MyDate[] | null {
  const [dates, setDates] = useState<MyDate[] | null>(null);
  useEffect(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    fetch(`/api/brief/dates?today=${today}`).then(r => (r.ok ? r.json() : null)).then(j => setDates(j?.dates ?? [])).catch(() => setDates([]));
  }, []);
  return dates;
}
export const KIND_LABEL: Record<MyDate['kind'], string> = { deal: 'Deal', checklist: 'Diligence', asset: 'Asset', personal: 'Personal', task: 'Follow-up' };
export function dueTone(iso: string): 'over' | 'today' | 'soon' {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const n = Math.round((new Date(iso + 'T00:00:00').getTime() - t.getTime()) / 86_400_000);
  return n < 0 ? 'over' : n === 0 ? 'today' : 'soon';
}

function YourDates({ dates }: { dates: MyDate[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? dates : dates.slice(0, 8);
  return (
    <Section title="Your dates" sub="next 7 days · from the CRM">
      {dates.length === 0 ? <p className="text-sm text-slate-500">Nothing due in the next 7 days.</p> : (
        <ul className="card divide-y divide-slate-100 dark:divide-slate-800">
          {shown.map((d, i) => {
            const tone = dueTone(d.date);
            return (
              <li key={i}>
                <Link href={d.href} className="flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <span className={`pill w-[72px] shrink-0 justify-center font-mono ${tone === 'over' ? 'pill-red' : tone === 'today' ? 'pill-amber' : 'pill-slate'}`}>{tone === 'over' ? 'overdue' : tone === 'today' ? 'today' : shortDay(d.date)}</span>
                  <span className="w-[70px] shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-navy dark:text-blue-300">{KIND_LABEL[d.kind]}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200"><b className="font-semibold">{d.where}</b> · {d.what}</span>
                  {d.amount ? <span className="font-mono text-xs text-slate-500">{fmt(d.amount)}</span> : null}
                </Link>
              </li>
            );
          })}
          {dates.length > 8 && (
            <li><button onClick={() => setAll(a => !a)} className="w-full px-4 py-2 text-left text-xs font-medium text-navy dark:text-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800/50">{all ? 'Show fewer' : `Show ${dates.length - 8} more`}</button></li>
          )}
        </ul>
      )}
    </Section>
  );
}

// Chart colors that follow the CRM's light / dark theme (set on the wrapper as CSS variables).
const SCREEN_INK: ChartInk = { line: 'var(--rb-line)', text: 'var(--rb-text)', grid: 'var(--rb-grid)', strong: 'var(--rb-strong)' };
const INK_VARS = '[--rb-line:#1E3A5F] [--rb-text:#64748B] [--rb-grid:#E2E8F0] [--rb-strong:#0F172A] dark:[--rb-line:#93C5FD] dark:[--rb-text:#94A3B8] dark:[--rb-grid:#334155] dark:[--rb-strong:#F1F5F9]';
const BODY = 'text-[15px] leading-relaxed text-slate-700 dark:text-slate-300';

function Focus({ items }: { items: FocusItem[] }) {
  return (
    <Section title="Data in focus" sub="the numbers that mattered, and what experts make of them">
      <div className="space-y-4">
        {items.map((f, i) => {
          const pts = (f.chart ? list<[string, number]>(f.chart.pts) : []).filter(p => Array.isArray(p) && typeof p[1] === 'number');
          const experts = list<NonNullable<FocusItem['experts']>[number]>(f.experts);
          return (
            <article key={i} className="card px-5 py-5 sm:px-7">
              {f.tag && <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-navy dark:text-blue-300">{f.tag}</p>}
              <h3 className="text-lg font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">{f.title}</h3>
              {(has(f.act) || has(f.cons) || has(f.prior)) && (
                <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {f.rel && <span className="text-slate-500">{f.rel}</span>}
                  {has(f.act) && <Labeled label="Actual" value={f.act as string} cls={f.good == null ? 'text-slate-900 dark:text-slate-100' : f.good ? UP_GOOD : UP_BAD} />}
                  {has(f.cons) && <Labeled label="Consensus" value={f.cons as string} cls="text-slate-700 dark:text-slate-300" />}
                  {has(f.prior) && <Labeled label="Prior" value={f.prior as string} cls={FLAT} />}
                </p>
              )}
              <div className={`mt-3 grid gap-5 items-start ${pts.length > 1 ? 'lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]' : ''}`}>
                <div className="space-y-3 max-w-[78ch]">
                  {paras(f.body).map((p, j) => <p key={j} className={BODY} dangerouslySetInnerHTML={{ __html: safeHtml(p) }} />)}
                </div>
                {pts.length > 1 && (
                  <div className={INK_VARS}>
                    {f.chart?.t && <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">{f.chart.t}</p>}
                    <MiniLine pts={pts} unit={f.chart?.unit || ''} ink={SCREEN_INK} />
                    {f.chart?.src && <p className="mt-1 text-[10px] text-slate-400">{f.chart.src}</p>}
                  </div>
                )}
              </div>
              {experts.length > 0 && (
                <ul className="mt-4 space-y-2">
                  {experts.map((e, j) => (
                    <li key={j} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3 text-[13px] leading-snug text-slate-700 dark:text-slate-300">
                      <b className="text-slate-900 dark:text-slate-100">{e.who}:</b> <span dangerouslySetInnerHTML={{ __html: safeHtml(e.view) }} />
                      {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-xs text-slate-400 underline underline-offset-2">{e.src || 'source'}</a>
                        : e.src ? <span className="ml-1.5 text-xs text-slate-400">{e.src}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
              {has(f.lean) && <p className="mt-3 text-[13px] italic text-slate-600 dark:text-slate-400"><b className="not-italic text-slate-800 dark:text-slate-200">Where forecasters lean:</b> {f.lean}</p>}
              {f.src && <p className="mt-3 text-[11px] text-slate-400">{f.src}</p>}
            </article>
          );
        })}
      </div>
    </Section>
  );
}

// World Desk: lead geopolitical story, hotspot tracker, foreign central banks, real policy rates.
// `w.src` stays out of the CRM, like `foot`.
function WorldDesk({ w }: { w: World }) {
  const lead = w.lead!;
  const views = list<NonNullable<NonNullable<World['lead']>['views']>[number]>(lead.views);
  const hot = list<NonNullable<World['hot']>[number]>(w.hot).filter(h => typeof h === 'object' && h.r);
  const cb = list<NonNullable<World['cb']>[number]>(w.cb).filter(c => typeof c === 'object' && c.bank);
  const real = w.real ? list<[string, number]>(w.real.pts).filter(p => Array.isArray(p) && typeof p[1] === 'number') : [];
  const sub = 'ml-1.5 text-[10px] font-medium normal-case tracking-normal text-slate-400';
  const h4 = 'mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-navy dark:text-blue-300';
  return (
    <Section title="World Desk" sub={lead.kicker}>
      <article className="card px-5 py-5 sm:px-7">
        <h3 className="text-lg sm:text-xl font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">{lead.title}</h3>
        <div className="mt-3 space-y-3 max-w-[78ch]">
          {paras(lead.body).map((p, i) => <p key={i} className={BODY} dangerouslySetInnerHTML={{ __html: safeHtml(p) }} />)}
        </div>
        {has(lead.reach) && (
          <p className="mt-3 rounded-r-md border-l-[3px] border-navy dark:border-blue-300 bg-slate-50 dark:bg-slate-800/50 px-4 py-2.5 text-[13px] leading-snug text-slate-700 dark:text-slate-300"
            dangerouslySetInnerHTML={{ __html: safeHtml(`<b>How it reaches you:</b> ${lead.reach}`) }} />
        )}
        {views.length > 0 && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {views.map((v, i) => (
              <p key={i} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3 text-[13px] leading-snug text-slate-700 dark:text-slate-300">
                <b className="text-slate-900 dark:text-slate-100">{v.who}:</b> <span dangerouslySetInnerHTML={{ __html: safeHtml(v.view) }} />
                {v.url && <a href={v.url} target="_blank" rel="noopener noreferrer" className="ml-1.5 text-xs text-slate-400 underline underline-offset-2">{v.src || 'source'}</a>}
              </p>
            ))}
          </div>
        )}

        {hot.length > 0 && (
          <div className="mt-6">
            <p className={h4}>Hotspot tracker</p>
            <div className="overflow-x-auto">
              <table className="table-clean">
                <thead><tr><th>Region</th><th>What changed</th><th>Trend</th><th>Market channel</th><th>Next date</th></tr></thead>
                <tbody>
                  {hot.map((h, i) => (
                    <tr key={i} className="row align-top">
                      <td className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">{h.r}</td>
                      <td className="text-[13px] leading-snug min-w-[220px]">{h.chg}</td>
                      <td><span className={`inline-block whitespace-nowrap rounded border px-1.5 py-px text-[9px] font-bold uppercase tracking-[0.06em] ${TREND[h.tc || 'std'] || TREND.std}`}>{h.trend}</span></td>
                      <td className="text-[13px] leading-snug min-w-[140px]">{h.ch}</td>
                      <td className="text-[13px] leading-snug min-w-[120px]">{h.next}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(cb.length > 0 || real.length > 0) && (
          <div className="mt-6 grid gap-6 lg:grid-cols-2 items-start">
            {cb.length > 0 && (
              <div>
                <p className={h4}>Central bank watch<span className={sub}>next 3 weeks, ex-Fed</span></p>
                <ul>
                  {cb.map((c, i) => (
                    <li key={i} className="grid grid-cols-[56px_1fr] gap-2 border-b border-slate-100 dark:border-slate-800 py-1.5 text-[13px] text-slate-700 dark:text-slate-300">
                      <span className="font-mono text-xs font-semibold text-navy dark:text-blue-300">{/^\d{4}-\d{2}-\d{2}$/.test(c.d) ? shortDay(c.d) : c.d}</span>
                      <span><b className="text-slate-900 dark:text-slate-100">{c.bank}</b>, {c.rate}: {c.exp}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {real.length > 0 && (
              <div className={INK_VARS}>
                <p className={h4}>{w.real?.t || "Who's really tight?"}<span className={sub}>policy rate minus CPI</span></p>
                <RealBars pts={real} ink={SCREEN_INK} />
                <p className="mt-1 text-[10px] text-slate-400">0 = rates match inflation</p>
              </div>
            )}
          </div>
        )}
      </article>
    </Section>
  );
}

function Dive({ d }: { d: DeepDive }) {
  return (
    <Section title="Deep dive" sub={d.kicker}>
      <article className="card px-5 py-5 sm:px-7">
        <h3 className="text-lg sm:text-xl font-semibold leading-snug tracking-tight text-slate-900 dark:text-slate-100 [text-wrap:balance]">{d.title}</h3>
        {d.dek && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{d.dek}</p>}
        <div className="mt-3 space-y-3 max-w-[78ch]">
          {paras(d.body).map((p, i) => <p key={i} className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: safeHtml(p) }} />)}
        </div>
        {d.table && list(d.table.rows).length > 0 && (
          <div className="mt-4 overflow-x-auto">
            {d.table.cap && <p className="mb-1 text-xs font-semibold text-slate-600 dark:text-slate-300">{d.table.cap}</p>}
            <table className="table-clean">
              <thead><tr>{list<string>(d.table.cols).map((c, i) => <th key={i} className={i > 0 ? '!text-right' : ''}>{c}</th>)}</tr></thead>
              <tbody>
                {list<string[]>(d.table.rows).map((r, i) => (
                  <tr key={i} className="row">{list<string>(r).map((c, j) => <td key={j} className={j > 0 ? 'num' : 'font-medium text-slate-900 dark:text-slate-100'}>{c}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list(d.watch).length > 0 && (
          <div className="mt-4 rounded-md bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-navy dark:text-blue-300">What to watch</p>
            <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[13px] text-slate-700 dark:text-slate-300">
              {list<string>(d.watch).map((w, i) => <li key={i} dangerouslySetInnerHTML={{ __html: safeHtml(w) }} />)}
            </ul>
          </div>
        )}
        {d.src && <p className="mt-3 text-[11px] text-slate-400">{d.src}</p>}
      </article>
    </Section>
  );
}

// One side of the economic calendar: actual vs expected vs prior, no notes.
function CalTable({ title, rows, released }: { title: string; rows: CalItem[]; released?: boolean }) {
  return (
    <div className="card overflow-x-auto">
      <div className="card-header !py-2"><p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">{title}</p></div>
      {rows.length === 0 ? <p className="px-4 py-3 text-xs text-slate-400">Nothing scheduled.</p> : (
        <table className="table-clean">
          <thead>
            <tr>
              <th>Day</th><th>Release</th>
              {released && <th className="!text-right">Actual</th>}
              <th className="!text-right">Exp.</th><th className="!text-right">Prior</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i, k) => {
              const event = !has(i.act) && !has(i.cons) && !has(i.prior);
              return (
              <tr key={k} className="row align-top" title={i.why}>
                <td className="whitespace-nowrap text-[11px] text-slate-500">{dayLabel(i.d).replace(/,.*/, '')}</td>
                <td className="text-[12.5px] font-medium text-slate-800 dark:text-slate-200">{i.e}</td>
                {event ? <td colSpan={released ? 3 : 2} className="text-[11px] italic text-slate-500 dark:text-slate-400">{i.why}</td> : <>
                {released && <td className={`num font-semibold whitespace-nowrap ${i.good == null ? 'text-slate-900 dark:text-slate-100' : i.good ? UP_GOOD : UP_BAD}`}>{has(i.act) ? i.act : ''}</td>}
                <td className="num whitespace-nowrap text-slate-600 dark:text-slate-300">{has(i.cons) ? i.cons : ''}</td>
                <td className="num whitespace-nowrap text-slate-500">{has(i.prior) ? i.prior : ''}</td>
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

// Standing readings (Fed funds target and the like), one per line under the rates table.
function Standing({ rows }: { rows: EconRow[] }) {
  return (
    <ul className="mt-3 space-y-1 text-xs leading-snug text-slate-600 dark:text-slate-300">
      {rows.map(r => (
        <li key={r.n}>
          <span className="text-slate-500">{r.n}</span>{' '}
          <b className={`font-mono ${econCls(r)}`}>{r.v}</b>
          {r.d && <span className="text-slate-400"> · {r.d}</span>}
        </li>
      ))}
    </ul>
  );
}

function KeyRatesTable({ B }: { B: Brief }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table-clean">
        <thead>
          <tr>
            <th>Rate</th><th className="!text-right">Now</th><th className="!text-right">1Y ago</th>
            <th className="!text-right">Δ1M</th><th className="!text-right">Δ6M</th><th className="!text-right">Δ1Y</th>
          </tr>
        </thead>
        <tbody>
          {B.key.map(k => {
            const lv = rateLevels(B, k);
            return (
              <tr key={k.n} className="row">
                <td className="font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                  {k.n}{has(k.asof) && <span className="ml-1.5 text-[10px] font-normal text-slate-400">{k.asof}</span>}
                </td>
                <td className="num font-semibold text-slate-900 dark:text-slate-100">{k.cur != null ? `${k.cur.toFixed(2)}%` : ''}</td>
                <td className="num text-slate-500">{lv[3] ?? ''}</td>
                {[k.d1m, k.d6m, k.d1y].map((v, i) => <td key={'d' + i} className={`num font-semibold ${rateCls(v)}`}>{v != null ? bp(v) : ''}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MarketCard({ t }: { t: TapeRow }) {
  const color = t.rate ? rateCls : stockCls;
  return (
    <div className="card px-3.5 py-3">
      <p className="stat-label">{t.n}</p>
      <p className="text-[17px] font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">{t.v}</p>
      <Changes items={[['Day', t.ctext, color(t.c)], ['1Y', t.ytext, color(t.y)]]} />
      {t.why && <p className="mt-1.5 text-xs leading-snug text-slate-600 dark:text-slate-300">{t.why}</p>}
    </div>
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
      <span className={cls}>{value}</span>
    </span>
  );
}

// [label, displayed value or null, color class]; values that are missing are left out.
function Changes({ items }: { items: [string, string | null | undefined, string][] }) {
  const shown = items.filter(([, v]) => has(v));
  if (!shown.length) return null;
  return (
    <div className="flex flex-wrap gap-x-3 font-mono tabular-nums text-[11px]">
      {shown.map(([l, v, c]) => <Labeled key={l} label={l} value={v as string} cls={c} />)}
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
      <p className="mt-2 text-[10px] text-slate-400">Treasury par yields, daily · latest {latest}</p>
    </section>
  );
}
