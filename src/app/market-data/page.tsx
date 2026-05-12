'use client';

import { useEffect, useState, useCallback } from 'react';

// Default shape for the snapshot blob. Matches the institutional dashboard reference.
interface EconomyData {
  rates: {
    federal: { metric: string; ty_ago: number | null; m6_ago: number | null; today: number | null }[];
    cost_of_debt: { metric: string; today: number | null; spread: number | null; cost: number | null }[];
    cap_rates: { metric: string; dec_2021_peak: number | null; today: number | null }[];
  };
  yield_curve: {
    today: { tenor: string; rate: number | null }[];
    m6_ago: { tenor: string; rate: number | null }[];
    ty_ago: { tenor: string; rate: number | null }[];
  };
  metrics: { metric: string; latest: string; yoy: string }[];
  trading_partners: { country: string; import_value: string; pct: string; yoy: string }[];
  ports: { year: string; values: Record<string, number | null> }[];
  port_columns: string[];

  // Logistics Managers' Index — 8 components + headline. Scale 0–100, 50 = neutral.
  lmi: {
    report_month: string;       // e.g. "April 2026"
    components: { name: string; latest: number | null; prior: number | null }[];
  };

  // Macro research themes from outside sources
  research: {
    source: string;             // "Howard Marks", "Eye on the Market", "Calculated Risk", "LMI Report"
    title: string;
    published: string;          // ISO date or "Apr 2026"
    themes: string;             // free-form bullets / paragraph
    url: string;
  }[];
}

interface MarketSnapshot {
  id: number;
  snapshot_date: string;
  data: EconomyData;
}

interface Release {
  id: number;
  name: string;
  release_date: string;
  release_time: string | null;
  previous_value: string | null;
  consensus: string | null;
  actual_value: string | null;
  interpretation: string | null;
  importance: string;
  url: string | null;
}

const DEFAULT_DATA: EconomyData = {
  rates: {
    federal: [
      { metric: '2Y UST Yield', ty_ago: 3.87, m6_ago: 3.55, today: 3.81 },
      { metric: '5Y UST Yield', ty_ago: 3.91, m6_ago: 3.68, today: 3.97 },
      { metric: '10Y UST Yield', ty_ago: 4.17, m6_ago: 4.12, today: 4.33 },
      { metric: 'SOFR Rate', ty_ago: 4.39, m6_ago: 4.20, today: 3.68 },
      { metric: 'Fed Funds Rate', ty_ago: 4.33, m6_ago: 4.33, today: 3.64 },
    ],
    cost_of_debt: [
      { metric: '10Y UST Yield', today: 4.33, spread: 3.50, cost: 7.83 },
      { metric: 'SOFR Rate', today: 3.68, spread: 2.50, cost: 6.18 },
      { metric: 'Fed Funds Rate', today: 3.64, spread: 2.50, cost: 6.14 },
    ],
    cap_rates: [
      { metric: 'T1 Coastal', dec_2021_peak: 4.00, today: 5.75 },
      { metric: 'T1 Inland', dec_2021_peak: 4.50, today: 6.00 },
      { metric: 'T2 Growth', dec_2021_peak: 4.75, today: 6.75 },
    ],
  },
  yield_curve: {
    today: [
      { tenor: '30 Day', rate: 3.74 },
      { tenor: '1Y', rate: 3.70 },
      { tenor: '2Y', rate: 3.70 },
      { tenor: '5Y', rate: 3.68 },
      { tenor: '10Y', rate: 3.84 },
    ],
    m6_ago: [
      { tenor: '30 Day', rate: 4.20 },
      { tenor: '1Y', rate: 4.05 },
      { tenor: '2Y', rate: 3.95 },
      { tenor: '5Y', rate: 3.85 },
      { tenor: '10Y', rate: 3.80 },
    ],
    ty_ago: [
      { tenor: '30 Day', rate: 4.40 },
      { tenor: '1Y', rate: 4.40 },
      { tenor: '2Y', rate: 4.30 },
      { tenor: '5Y', rate: 4.10 },
      { tenor: '10Y', rate: 3.95 },
    ],
  },
  metrics: [
    { metric: 'U.S. Container Imports (2025 annual)', latest: '25,400,000 TEU', yoy: '↓0.4% vs 2024 (25.5M TEU)' },
    { metric: 'U.S. Container Imports (Jan 2026 actual)', latest: '2,080,000 TEU', yoy: '↑3.8% vs Dec; ↓ YOY' },
    { metric: 'U.S. Container Imports (Mar 2026 forecast)', latest: '1,910,000 TEU', yoy: '↓11.2% YOY forecast' },
    { metric: 'H1 2026 Import Forecast', latest: '12,210,000 TEU', yoy: '↓2.5% vs H1 2025 (12.53M)' },
    { metric: 'FOMC Fed Funds Target (Mar 2026)', latest: '3.50%–3.75%', yoy: 'Held steady — 2nd consecutive hold' },
    { metric: 'SOFR (3/31/2026)', latest: '3.68%', yoy: 'Unchanged from Jan hold' },
    { metric: 'Fed Funds Effective (3/31/2026)', latest: '3.64%', yoy: 'Within 3.50–3.75% target range' },
    { metric: 'Asia–US West Coast Rate (FBX01)', latest: '~$2,184 USD/FEU', yoy: '↑ rising on Mid-East tensions' },
    { metric: 'Asia–US East Coast Rate (FBX03)', latest: '~$3,198 USD/FEU', yoy: '↑ emergency fuel surcharges added' },
    { metric: 'Global 40\' Index (WCI, 3/26)', latest: '$2,279/container', yoy: '↑5% WoW — 4th straight week up' },
  ],
  trading_partners: [
    { country: 'Mexico', import_value: '42.5 B USD', pct: '16.30%', yoy: '#1 import source (record 2025)' },
    { country: 'Canada', import_value: '28.3 B USD', pct: '10.90%', yoy: '#2 overall; ↓ from 2025 levels' },
    { country: 'Taiwan', import_value: '21.7 B USD', pct: '8.30%', yoy: '#3 in Jan; surged on semis' },
    { country: 'China', import_value: '21.1 B USD', pct: '8.10%', yoy: '#4 in Jan; ↓ sharply from 2024' },
    { country: 'Vietnam', import_value: '19.6 B USD', pct: '7.50%', yoy: '#5; record 2025 at $193.8B' },
    { country: 'South Korea', import_value: '11.6 B USD', pct: '4.50%', yoy: '#6 in Jan; up from #9 in 2025' },
    { country: 'Japan', import_value: '11.0 B USD', pct: '4.20%', yoy: '#7 in Jan; down from #7 in 2025' },
    { country: 'Germany', import_value: '10.5 B USD', pct: '4.00%', yoy: '#8 in Jan; down from #6 in 2025' },
    { country: 'Thailand', import_value: '9.3 B USD', pct: '3.60%', yoy: '#9 in Jan; new to top 10' },
    { country: 'India', import_value: '7.9 B USD', pct: '3.00%', yoy: '#10 in Jan; down from #11 in 2025' },
  ],
  port_columns: ['Los Angeles', 'Long Beach', 'NY / NJ', 'Savannah', 'Houston', 'Seattle (NWSA)', 'Baltimore', 'South Florida'],
  ports: [
    { year: '2015', values: { 'Los Angeles': 8.8, 'Long Beach': 7.4, 'NY / NJ': 7.1, 'Savannah': 3.1, 'Houston': 2.6, 'Seattle (NWSA)': 3.6, 'Baltimore': 0.5, 'South Florida': 1.6 } },
    { year: '2016', values: { 'Los Angeles': 9.0, 'Long Beach': 7.6, 'NY / NJ': 7.3, 'Savannah': 3.3, 'Houston': 2.7, 'Seattle (NWSA)': 3.7, 'Baltimore': 0.5, 'South Florida': 1.6 } },
    { year: '2017', values: { 'Los Angeles': 9.4, 'Long Beach': 8.0, 'NY / NJ': 7.6, 'Savannah': 3.6, 'Houston': 3.0, 'Seattle (NWSA)': 3.8, 'Baltimore': 0.5, 'South Florida': 1.7 } },
    { year: '2018', values: { 'Los Angeles': 10.1, 'Long Beach': 8.7, 'NY / NJ': 8.1, 'Savannah': 4.2, 'Houston': 3.3, 'Seattle (NWSA)': 3.8, 'Baltimore': 0.6, 'South Florida': 1.8 } },
    { year: '2019', values: { 'Los Angeles': 9.3, 'Long Beach': 8.1, 'NY / NJ': 7.8, 'Savannah': 4.6, 'Houston': 3.6, 'Seattle (NWSA)': 3.5, 'Baltimore': 0.6, 'South Florida': 1.8 } },
    { year: '2020', values: { 'Los Angeles': 9.2, 'Long Beach': 8.4, 'NY / NJ': 7.9, 'Savannah': 4.8, 'Houston': 3.7, 'Seattle (NWSA)': 3.2, 'Baltimore': 0.6, 'South Florida': 2.0 } },
    { year: '2021', values: { 'Los Angeles': 10.7, 'Long Beach': 9.1, 'NY / NJ': 9.5, 'Savannah': 5.9, 'Houston': 4.0, 'Seattle (NWSA)': 3.0, 'Baltimore': 0.6, 'South Florida': 2.0 } },
    { year: '2022', values: { 'Los Angeles': 10.7, 'Long Beach': 9.1, 'NY / NJ': 9.5, 'Savannah': 5.9, 'Houston': 4.0, 'Seattle (NWSA)': 2.6, 'Baltimore': 0.8, 'South Florida': 2.1 } },
    { year: '2023', values: { 'Los Angeles': 8.6, 'Long Beach': 9.0, 'NY / NJ': 7.8, 'Savannah': 4.9, 'Houston': 3.8, 'Seattle (NWSA)': 3.0, 'Baltimore': 0.8, 'South Florida': 2.2 } },
    { year: '2024', values: { 'Los Angeles': 10.3, 'Long Beach': 9.1, 'NY / NJ': 8.7, 'Savannah': 5.1, 'Houston': 4.1, 'Seattle (NWSA)': 3.3, 'Baltimore': 0.7, 'South Florida': 2.2 } },
    { year: '2025', values: { 'Los Angeles': 10.0, 'Long Beach': 8.2, 'NY / NJ': 7.5, 'Savannah': 4.8, 'Houston': 4.0, 'Seattle (NWSA)': 3.4, 'Baltimore': 0.8, 'South Florida': 2.3 } },
  ],
  lmi: {
    report_month: 'April 2026',
    // Scale 0–100; >50 = expanding, <50 = contracting
    components: [
      { name: 'LMI Headline',        latest: null, prior: null },
      { name: 'Inventory Levels',    latest: null, prior: null },
      { name: 'Inventory Costs',     latest: null, prior: null },
      { name: 'Warehousing Capacity',latest: null, prior: null },
      { name: 'Warehousing Util.',   latest: null, prior: null },
      { name: 'Warehousing Prices',  latest: null, prior: null },
      { name: 'Transportation Cap.', latest: null, prior: null },
      { name: 'Transportation Util.',latest: null, prior: null },
      { name: 'Transportation Prices', latest: null, prior: null },
    ],
  },
  research: [
    { source: 'LMI Report',           title: '',  published: '', themes: '', url: 'https://www.the-lmi.com/' },
    { source: 'Howard Marks Memo',    title: '',  published: '', themes: '', url: 'https://www.oaktreecapital.com/insights/memos' },
    { source: 'Eye on the Market',    title: '',  published: '', themes: '', url: 'https://am.jpmorgan.com/us/en/asset-management/adv/insights/market-insights/eye-on-the-market/' },
    { source: 'Calculated Risk',      title: '',  published: '', themes: '', url: 'https://www.calculatedriskblog.com/' },
  ],
};

const fmtPct = (n: number | null, d = 2) => n == null ? '—' : `${n.toFixed(d)}%`;

interface AutoResearch {
  items: ResearchItem[];
  additional_calc_risk: ResearchItem[];
  fetched_at: string;
}
interface ResearchItem {
  source: string;
  title: string;
  published: string;
  themes: string;
  url: string;
  fetched_at: string;
}
interface AutoCalendarItem {
  id: string;
  name: string;
  release_date: string;
  release_time: string | null;
  previous_value: string | null;
  consensus: string | null;
  actual_value: string | null;
  importance: 'low' | 'medium' | 'high';
  url: string | null;
}

export default function EconomyUpdatePage() {
  const [snapshot, setSnapshot] = useState<MarketSnapshot | null>(null);
  const [data, setData] = useState<EconomyData>(DEFAULT_DATA);
  const [releases, setReleases] = useState<Release[]>([]);
  const [editing, setEditing] = useState(false);
  const [autoResearch, setAutoResearch] = useState<AutoResearch | null>(null);
  const [autoCalendar, setAutoCalendar] = useState<{ items: AutoCalendarItem[]; fetched_at?: string } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    const [s, r] = await Promise.all([
      fetch('/api/market-data').then(x => x.json()),
      fetch('/api/releases').then(x => x.json()),
    ]);
    if (s && s.data) {
      const merged = { ...DEFAULT_DATA, ...s.data };
      setSnapshot({ ...s, data: merged });
      setData(merged);
    } else {
      setData(DEFAULT_DATA);
    }
    setReleases(r);
  }, []);

  const loadAuto = useCallback(async (force = false) => {
    setRefreshing(force);
    try {
      const [research, cal] = await Promise.all([
        fetch('/api/macro/research' + (force ? `?t=${Date.now()}` : '')).then(x => x.json()),
        fetch('/api/macro/calendar' + (force ? `?t=${Date.now()}` : '')).then(x => x.json()),
      ]);
      setAutoResearch(research);
      setAutoCalendar(cal);
    } catch {}
    finally { setRefreshing(false); }
  }, []);

  useEffect(() => { loadAll(); loadAuto(false); }, [loadAll, loadAuto]);

  const save = async () => {
    await fetch('/api/market-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot_date: new Date().toISOString().split('T')[0], data }),
    });
    setEditing(false);
    loadAll();
  };

  return (
    <div className="px-8 py-8 max-w-[1500px]">
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 mb-1">
            Mission Critical Industrial · Macro Brief
          </p>
          <h1 className="text-xl font-medium text-gray-900 dark:text-gray-100 tracking-tight">Economy Update</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono mr-1">
            Snapshot: {snapshot?.snapshot_date || 'default'}
          </span>
          <button
            onClick={() => loadAuto(true)}
            disabled={refreshing}
            title="Refresh macro feeds + calendar"
            className="px-2.5 py-1 text-[11px] text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 flex items-center gap-1"
          >
            <svg className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Refreshing' : 'Refresh feeds'}
          </button>
          {editing ? (
            <>
              <button onClick={() => { setEditing(false); loadAll(); }} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
              <button onClick={save} className="px-3 py-1.5 text-xs bg-amber text-white rounded hover:bg-amber-dark">Save Snapshot</button>
            </>
          ) : (
            <button onClick={() => setEditing(true)} className="px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800">Edit</button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <RateUpdate data={data} editing={editing} onChange={setData} />
        <YieldCurve data={data.yield_curve} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <MetricsCard data={data.metrics} editing={editing} onChange={(m) => setData({ ...data, metrics: m })} />
        <PartnersCard data={data.trading_partners} editing={editing} onChange={(p) => setData({ ...data, trading_partners: p })} />
      </div>

      <PortVolumes data={data.ports} columns={data.port_columns} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <LMICard data={data.lmi || DEFAULT_DATA.lmi} editing={editing}
          onChange={(lmi) => setData({ ...data, lmi })} />
        <ResearchCard
          manual={data.research || DEFAULT_DATA.research}
          auto={autoResearch}
          editing={editing}
          onChange={(research) => setData({ ...data, research })}
        />
      </div>

      <EconomicCalendar
        autoItems={autoCalendar?.items || []}
        manualReleases={releases}
        reload={loadAll}
        fetchedAt={autoCalendar?.fetched_at}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Rate Update
// ----------------------------------------------------------------------------

function RateUpdate({ data, editing, onChange }: { data: EconomyData; editing: boolean; onChange: (d: EconomyData) => void }) {
  const updateFederal = (i: number, field: 'ty_ago' | 'm6_ago' | 'today', val: string) => {
    const next = [...data.rates.federal];
    next[i] = { ...next[i], [field]: val === '' ? null : parseFloat(val) };
    onChange({ ...data, rates: { ...data.rates, federal: next } });
  };
  const updateCost = (i: number, field: 'today' | 'spread' | 'cost', val: string) => {
    const next = [...data.rates.cost_of_debt];
    next[i] = { ...next[i], [field]: val === '' ? null : parseFloat(val) };
    onChange({ ...data, rates: { ...data.rates, cost_of_debt: next } });
  };
  const updateCap = (i: number, field: 'dec_2021_peak' | 'today', val: string) => {
    const next = [...data.rates.cap_rates];
    next[i] = { ...next[i], [field]: val === '' ? null : parseFloat(val) };
    onChange({ ...data, rates: { ...data.rates, cap_rates: next } });
  };

  const cellInputCls = "w-full text-right font-mono text-[11px] bg-transparent border-0 outline-none focus:ring-1 focus:ring-amber rounded px-1";

  return (
    <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <h2 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-gray-700 dark:text-gray-200 px-4 py-2.5 bg-gray-50 dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
        Rate Update
      </h2>

      {/* Federal rates */}
      <Subsection label="Federal Rates" cols={['', '1Y Ago', '6M Ago', 'Today']}>
        {data.rates.federal.map((r, i) => (
          <tr key={r.metric} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
            <td className="py-1.5 px-4 text-xs text-gray-700 dark:text-gray-200">{r.metric}</td>
            <RateCell value={r.ty_ago} editing={editing} onChange={v => updateFederal(i, 'ty_ago', v)} cls={cellInputCls} />
            <RateCell value={r.m6_ago} editing={editing} onChange={v => updateFederal(i, 'm6_ago', v)} cls={cellInputCls} />
            <RateCell value={r.today} editing={editing} onChange={v => updateFederal(i, 'today', v)} cls={cellInputCls} bold />
          </tr>
        ))}
      </Subsection>

      {/* Cost of debt */}
      <Subsection label="Estimated All-in Cost of Debt" cols={['', 'Today', 'Spread to Ind.', 'Cost of Debt']}>
        {data.rates.cost_of_debt.map((r, i) => (
          <tr key={r.metric} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
            <td className="py-1.5 px-4 text-xs text-gray-700 dark:text-gray-200">{r.metric}</td>
            <RateCell value={r.today} editing={editing} onChange={v => updateCost(i, 'today', v)} cls={cellInputCls} />
            <RateCell value={r.spread} editing={editing} onChange={v => updateCost(i, 'spread', v)} cls={cellInputCls} />
            <RateCell value={r.cost} editing={editing} onChange={v => updateCost(i, 'cost', v)} cls={cellInputCls} bold />
          </tr>
        ))}
        <tr className="bg-gray-50 dark:bg-surface-dark border-t border-gray-300 dark:border-gray-600">
          <td className="py-1.5 px-4 text-xs italic text-gray-600 dark:text-gray-300">Average</td>
          <RateCell value={avg(data.rates.cost_of_debt.map(r => r.today))} editing={false} onChange={() => {}} cls={cellInputCls} italic />
          <RateCell value={avg(data.rates.cost_of_debt.map(r => r.spread))} editing={false} onChange={() => {}} cls={cellInputCls} italic />
          <RateCell value={avg(data.rates.cost_of_debt.map(r => r.cost))} editing={false} onChange={() => {}} cls={cellInputCls} italic />
        </tr>
      </Subsection>

      {/* Cap rates */}
      <Subsection label="Implied Cap Rates" cols={['', '', 'Dec 2021 Peak', 'Today']}>
        {data.rates.cap_rates.map((r, i) => (
          <tr key={r.metric} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
            <td className="py-1.5 px-4 text-xs text-gray-700 dark:text-gray-200" colSpan={2}>{r.metric}</td>
            <RateCell value={r.dec_2021_peak} editing={editing} onChange={v => updateCap(i, 'dec_2021_peak', v)} cls={cellInputCls} muted />
            <RateCell value={r.today} editing={editing} onChange={v => updateCap(i, 'today', v)} cls={cellInputCls} bold />
          </tr>
        ))}
      </Subsection>
    </div>
  );
}

function avg(values: (number | null)[]): number | null {
  const valid = values.filter((v): v is number => v != null);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function Subsection({ label, cols, children }: { label: string; cols: string[]; children: React.ReactNode }) {
  return (
    <table className="w-full">
      <thead>
        <tr className="text-[9px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
          <th colSpan={cols.length} className="text-left py-1.5 px-4 bg-gray-50/50 dark:bg-surface-dark/50 font-semibold">
            {label}
          </th>
        </tr>
        <tr className="text-[10px] text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
          {cols.map((c, i) => (
            <th key={i} className={`py-1 px-4 ${i === 0 ? 'text-left' : 'text-right'} font-normal`}>{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

function RateCell({ value, editing, onChange, cls, bold, italic, muted }: {
  value: number | null; editing: boolean; onChange: (v: string) => void;
  cls: string; bold?: boolean; italic?: boolean; muted?: boolean;
}) {
  const text = bold ? 'font-semibold text-gray-900 dark:text-gray-100' :
               italic ? 'italic text-gray-600 dark:text-gray-300' :
               muted ? 'text-gray-500 dark:text-gray-400' :
               'text-gray-700 dark:text-gray-300';
  return (
    <td className={`py-1.5 px-4 text-right font-mono text-[11px] tabular-nums ${text}`}>
      {editing ? (
        <input type="number" step="0.01" value={value ?? ''} onChange={e => onChange(e.target.value)} className={cls} />
      ) : fmtPct(value)}
    </td>
  );
}

// ----------------------------------------------------------------------------
// Yield Curve (SVG line chart)
// ----------------------------------------------------------------------------

function YieldCurve({ data }: { data: EconomyData['yield_curve'] }) {
  const tenors = data.today.map(t => t.tenor);
  const allValues = [...data.today, ...data.m6_ago, ...data.ty_ago].map(t => t.rate).filter((r): r is number => r != null);
  const minVal = Math.floor((Math.min(...allValues) - 0.2) * 10) / 10;
  const maxVal = Math.ceil((Math.max(...allValues) + 0.2) * 10) / 10;

  const W = 540, H = 280;
  const padL = 40, padR = 16, padT = 16, padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xFor = (i: number) => padL + (i / (tenors.length - 1)) * innerW;
  const yFor = (rate: number) => padT + innerH - ((rate - minVal) / (maxVal - minVal)) * innerH;

  const buildPath = (series: { tenor: string; rate: number | null }[]) => {
    const pts = series.map((s, i) => s.rate == null ? null : `${i === 0 ? 'M' : 'L'}${xFor(i)},${yFor(s.rate)}`).filter(Boolean);
    return pts.join(' ');
  };

  // Y-axis gridlines (4 ticks)
  const ticks: number[] = [];
  const tickStep = (maxVal - minVal) / 4;
  for (let i = 0; i <= 4; i++) ticks.push(minVal + tickStep * i);

  return (
    <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <h2 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-gray-700 dark:text-gray-200 px-4 py-2.5 bg-gray-50 dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
        Yield Curve
      </h2>
      <div className="p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto">
          {ticks.map((t, i) => (
            <g key={i}>
              <line x1={padL} y1={yFor(t)} x2={W - padR} y2={yFor(t)} className="stroke-gray-200 dark:stroke-gray-700" strokeWidth="0.5" strokeDasharray="2 3" />
              <text x={padL - 6} y={yFor(t) + 3} textAnchor="end" className="fill-gray-400 dark:fill-gray-500 text-[9px] font-mono">{t.toFixed(2)}%</text>
            </g>
          ))}
          {tenors.map((tn, i) => (
            <text key={tn} x={xFor(i)} y={H - padB + 16} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500 text-[10px]">{tn}</text>
          ))}

          {/* 1Y Ago — dashed amber */}
          <path d={buildPath(data.ty_ago)} fill="none" stroke="#BA7517" strokeWidth="1.5" strokeDasharray="5 4" />
          {/* 6M Ago — dashed gray */}
          <path d={buildPath(data.m6_ago)} fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" />
          {/* Today — solid navy */}
          <path d={buildPath(data.today)} fill="none" stroke="#0B1A2B" strokeWidth="2" />
          {data.today.map((d, i) => d.rate == null ? null : (
            <circle key={i} cx={xFor(i)} cy={yFor(d.rate)} r="3" fill="#0B1A2B" />
          ))}
          {data.today.map((d, i) => d.rate == null ? null : (
            <text key={`l${i}`} x={xFor(i)} y={yFor(d.rate) - 8} textAnchor="middle" className="fill-gray-700 dark:fill-gray-300 text-[9px] font-mono font-semibold">{d.rate.toFixed(2)}%</text>
          ))}
        </svg>

        <div className="flex items-center justify-center gap-5 text-[10px] text-gray-500 dark:text-gray-400 mt-1">
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 h-px bg-navy dark:bg-gray-300" />Today</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed border-gray-400" />6M Ago</span>
          <span className="flex items-center gap-1.5"><span className="inline-block w-4 border-t border-dashed border-amber" />1Y Ago</span>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Metrics Card
// ----------------------------------------------------------------------------

function MetricsCard({ data, editing, onChange }: { data: EconomyData['metrics']; editing: boolean; onChange: (m: EconomyData['metrics']) => void }) {
  const update = (i: number, key: 'metric' | 'latest' | 'yoy', v: string) => {
    const next = [...data];
    next[i] = { ...next[i], [key]: v };
    onChange(next);
  };
  const cellCls = "w-full bg-transparent border-0 outline-none text-[11px] focus:ring-1 focus:ring-amber rounded px-1";

  return (
    <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <h2 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-gray-700 dark:text-gray-200 px-4 py-2.5 bg-gray-50 dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
        Key Metrics
      </h2>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-1.5 px-4 font-semibold">Metric</th>
            <th className="text-left py-1.5 px-4 font-semibold">Latest Value</th>
            <th className="text-left py-1.5 px-4 font-semibold">YOY Change vs Prior Year</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
              <td className="py-1.5 px-4 text-gray-700 dark:text-gray-300">{editing ? <input value={m.metric} onChange={e => update(i, 'metric', e.target.value)} className={cellCls} /> : m.metric}</td>
              <td className="py-1.5 px-4 font-mono text-gray-900 dark:text-gray-100">{editing ? <input value={m.latest} onChange={e => update(i, 'latest', e.target.value)} className={cellCls} /> : m.latest}</td>
              <td className="py-1.5 px-4 text-gray-600 dark:text-gray-300">{editing ? <input value={m.yoy} onChange={e => update(i, 'yoy', e.target.value)} className={cellCls} /> : m.yoy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Trading Partners
// ----------------------------------------------------------------------------

function PartnersCard({ data, editing, onChange }: { data: EconomyData['trading_partners']; editing: boolean; onChange: (p: EconomyData['trading_partners']) => void }) {
  const update = (i: number, key: keyof EconomyData['trading_partners'][0], v: string) => {
    const next = [...data];
    next[i] = { ...next[i], [key]: v };
    onChange(next);
  };
  const cellCls = "w-full bg-transparent border-0 outline-none text-[11px] focus:ring-1 focus:ring-amber rounded px-1";

  return (
    <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <h2 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-gray-700 dark:text-gray-200 px-4 py-2.5 bg-gray-50 dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
        Top Trading Partners
      </h2>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-1.5 px-4 font-semibold">Country</th>
            <th className="text-right py-1.5 px-4 font-semibold">Imports 2026</th>
            <th className="text-right py-1.5 px-4 font-semibold">% Total</th>
            <th className="text-left py-1.5 px-4 font-semibold">YOY vs 2024</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p, i) => (
            <tr key={i} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
              <td className="py-1.5 px-4 text-gray-900 dark:text-gray-100 font-medium">{editing ? <input value={p.country} onChange={e => update(i, 'country', e.target.value)} className={cellCls} /> : p.country}</td>
              <td className="py-1.5 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{editing ? <input value={p.import_value} onChange={e => update(i, 'import_value', e.target.value)} className={cellCls + ' text-right'} /> : p.import_value}</td>
              <td className="py-1.5 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{editing ? <input value={p.pct} onChange={e => update(i, 'pct', e.target.value)} className={cellCls + ' text-right'} /> : p.pct}</td>
              <td className="py-1.5 px-4 text-gray-600 dark:text-gray-300">{editing ? <input value={p.yoy} onChange={e => update(i, 'yoy', e.target.value)} className={cellCls} /> : p.yoy}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Port Volumes
// ----------------------------------------------------------------------------

function PortVolumes({ data, columns }: { data: EconomyData['ports']; columns: string[] }) {
  return (
    <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-6">
      <h2 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-gray-700 dark:text-gray-200 px-4 py-2.5 bg-gray-50 dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
        Millions of TEU&apos;s Imported by Port (US)
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-1.5 px-4 font-semibold">Year</th>
              {columns.map(c => <th key={c} className="text-right py-1.5 px-4 font-semibold">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map(row => (
              <tr key={row.year} className="border-b border-gray-100 dark:border-gray-800 last:border-0">
                <td className="py-1.5 px-4 text-gray-700 dark:text-gray-300 font-mono">{row.year}</td>
                {columns.map(c => (
                  <td key={c} className="py-1.5 px-4 text-right font-mono tabular-nums text-gray-700 dark:text-gray-300">
                    {row.values[c] != null ? row.values[c]?.toFixed(1) : '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Economic Calendar — admin-editable releases
// ----------------------------------------------------------------------------

function EconomicCalendar({ autoItems, manualReleases, reload, fetchedAt }: {
  autoItems: AutoCalendarItem[];
  manualReleases: Release[];
  reload: () => void;
  fetchedAt?: string;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Release | null>(null);

  // Map auto items to the same Release shape so we can re-use CalendarSection.
  // Manual releases use negative IDs to distinguish; auto items use the positive id space starting at 1000000.
  const autoAsReleases: Release[] = autoItems.map((a, i) => ({
    id: 1_000_000 + i,
    name: a.name,
    release_date: a.release_date,
    release_time: a.release_time,
    previous_value: a.previous_value,
    consensus: a.consensus,
    actual_value: a.actual_value,
    interpretation: null,
    importance: a.importance,
    url: a.url,
  }));

  // De-dupe: if a manual release matches an auto one by (name, release_date), prefer the manual entry.
  const manualKeys = new Set(manualReleases.map(r => `${r.name.toLowerCase()}|${r.release_date}`));
  const mergedAuto = autoAsReleases.filter(a => !manualKeys.has(`${a.name.toLowerCase()}|${a.release_date}`));
  const allReleases = [...manualReleases, ...mergedAuto];

  const today = new Date();
  const dow = today.getDay() || 7;
  const monday = new Date(today); monday.setDate(today.getDate() - (dow - 1)); monday.setHours(0,0,0,0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6); sunday.setHours(23,59,59,999);
  const lastMonday = new Date(monday); lastMonday.setDate(monday.getDate() - 7);
  const lastSunday = new Date(sunday); lastSunday.setDate(sunday.getDate() - 7);

  const inRange = (d: string, start: Date, end: Date) => {
    const t = new Date(d + 'T00:00:00').getTime();
    return t >= start.getTime() && t <= end.getTime();
  };
  const thisWeek = allReleases.filter(r => inRange(r.release_date, monday, sunday)).sort((a, b) => a.release_date.localeCompare(b.release_date));
  const lastWeek = allReleases.filter(r => inRange(r.release_date, lastMonday, lastSunday)).sort((a, b) => a.release_date.localeCompare(b.release_date));

  return (
    <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <h2 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-gray-700 dark:text-gray-200">
            Economic Calendar
          </h2>
          {fetchedAt && (
            <span className="text-[9px] text-gray-400 dark:text-gray-500 font-mono">
              Auto · {new Date(fetchedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
            </span>
          )}
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }}
          className="px-2.5 py-1 text-[11px] text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
          + Add Manual
        </button>
      </div>

      <CalendarSection title={`This Week — ${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} to ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
        releases={thisWeek} onEdit={r => { if (r.id < 1_000_000) { setEditing(r); setShowForm(true); } }} onReload={reload}
        empty="Loading releases from Trading Economics… or none scheduled this week." />

      <CalendarSection title="Last Week" releases={lastWeek} onEdit={r => { if (r.id < 1_000_000) { setEditing(r); setShowForm(true); } }} onReload={reload} muted />

      {showForm && (
        <ReleaseModal release={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSaved={() => { setShowForm(false); setEditing(null); reload(); }} />
      )}
    </div>
  );
}

function CalendarSection({ title, releases, onEdit, onReload, muted, empty }: {
  title: string; releases: Release[]; onEdit: (r: Release) => void; onReload: () => void; muted?: boolean; empty?: string;
}) {
  const remove = async (id: number) => {
    if (!confirm('Delete this release?')) return;
    await fetch(`/api/releases/${id}`, { method: 'DELETE' });
    onReload();
  };

  if (releases.length === 0 && !empty) return null;

  const importanceColor: Record<string, string> = {
    high: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  };

  return (
    <div className={muted ? 'opacity-70' : ''}>
      <div className="px-4 py-2 text-[9px] uppercase tracking-[0.12em] text-gray-500 dark:text-gray-400 font-semibold border-b border-gray-100 dark:border-gray-800">
        {title}
      </div>
      {releases.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-gray-400 dark:text-gray-500">{empty}</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
              <th className="text-left py-1.5 px-4 font-semibold">Date</th>
              <th className="text-left py-1.5 px-4 font-semibold">Release</th>
              <th className="text-right py-1.5 px-4 font-semibold">Previous</th>
              <th className="text-right py-1.5 px-4 font-semibold">Consensus</th>
              <th className="text-right py-1.5 px-4 font-semibold">Actual</th>
              <th className="text-left py-1.5 px-4 font-semibold w-[40%]">Interpretation</th>
              <th className="w-12" />
            </tr>
          </thead>
          <tbody>
            {releases.map(r => {
              const isAuto = r.id >= 1_000_000;
              return (
              <tr key={r.id} className="border-b border-gray-100 dark:border-gray-800 last:border-0 group hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
                <td className="py-1.5 px-4 font-mono text-gray-700 dark:text-gray-300 whitespace-nowrap">
                  {new Date(r.release_date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  {r.release_time && <span className="text-gray-400 ml-1.5">{r.release_time}</span>}
                </td>
                <td className="py-1.5 px-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-900 dark:text-gray-100">{r.name}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium ${importanceColor[r.importance] || importanceColor.medium}`}>{r.importance}</span>
                    {isAuto && <span className="text-[9px] text-gray-400 dark:text-gray-500 font-mono">auto</span>}
                  </div>
                </td>
                <td className="py-1.5 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{r.previous_value || '—'}</td>
                <td className="py-1.5 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{r.consensus || '—'}</td>
                <td className={`py-1.5 px-4 text-right font-mono ${r.actual_value ? 'text-gray-900 dark:text-gray-100 font-semibold' : 'text-gray-400 dark:text-gray-500'}`}>
                  {r.actual_value || '—'}
                </td>
                <td className="py-1.5 px-4 text-gray-600 dark:text-gray-300 text-[11px]">{r.interpretation || <span className="text-gray-400 italic">{isAuto && r.actual_value ? '' : 'awaiting release'}</span>}</td>
                <td className="py-1.5 px-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex gap-1 justify-end">
                    {!isAuto && (
                      <>
                        <button onClick={() => onEdit(r)} className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200" title="Edit">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={() => remove(r.id)} className="p-1 text-gray-400 hover:text-red-600" title="Delete">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M11 7V4a2 2 0 114 0v3" /></svg>
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function ReleaseModal({ release, onClose, onSaved }: { release: Release | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: release?.name || '',
    release_date: release?.release_date || new Date().toISOString().split('T')[0],
    release_time: release?.release_time || '8:30 AM ET',
    previous_value: release?.previous_value || '',
    consensus: release?.consensus || '',
    actual_value: release?.actual_value || '',
    interpretation: release?.interpretation || '',
    importance: release?.importance || 'medium',
    url: release?.url || '',
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = async () => {
    if (!form.name.trim() || !form.release_date) return;
    const url = release ? `/api/releases/${release.id}` : '/api/releases';
    const method = release ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    onSaved();
  };

  const inputCls = "w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative bg-white dark:bg-surface rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{release ? 'Edit Release' : 'New Economic Release'}</h2>
        <div className="space-y-3">
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Release Name *</label>
            <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nonfarm Payrolls" className={inputCls} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Date *</label>
              <input type="date" value={form.release_date} onChange={e => setForm({ ...form, release_date: e.target.value })} className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Time</label>
              <input value={form.release_time} onChange={e => setForm({ ...form, release_time: e.target.value })} placeholder="8:30 AM ET" className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Importance</label>
              <select value={form.importance} onChange={e => setForm({ ...form, importance: e.target.value })} className={inputCls}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Previous</label>
              <input value={form.previous_value} onChange={e => setForm({ ...form, previous_value: e.target.value })} placeholder="142K" className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Consensus</label>
              <input value={form.consensus} onChange={e => setForm({ ...form, consensus: e.target.value })} placeholder="160K" className={inputCls} />
            </div>
            <div>
              <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Actual</label>
              <input value={form.actual_value} onChange={e => setForm({ ...form, actual_value: e.target.value })} placeholder="(after release)" className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">Interpretation</label>
            <textarea rows={3} value={form.interpretation} onChange={e => setForm({ ...form, interpretation: e.target.value })} className={inputCls}
              placeholder="What does the new number mean for IOS demand, rates, etc?" />
          </div>
          <div>
            <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">URL (optional)</label>
            <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://www.bls.gov/..." className={inputCls} />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={submit} disabled={!form.name.trim() || !form.release_date} className="px-3 py-1.5 text-xs bg-amber text-white rounded hover:bg-amber-dark disabled:opacity-50">
            {release ? 'Save' : 'Add Release'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// LMI — Logistics Managers' Index (monthly, 8 components + headline)
// ----------------------------------------------------------------------------

function LMICard({ data, editing, onChange }: {
  data: EconomyData['lmi'];
  editing: boolean;
  onChange: (lmi: EconomyData['lmi']) => void;
}) {
  const updateMonth = (v: string) => onChange({ ...data, report_month: v });
  const updateComponent = (i: number, field: 'latest' | 'prior', v: string) => {
    const next = [...data.components];
    next[i] = { ...next[i], [field]: v === '' ? null : parseFloat(v) };
    onChange({ ...data, components: next });
  };

  const cellInput = "w-full text-right font-mono text-[11px] bg-transparent border-0 outline-none focus:ring-1 focus:ring-amber rounded px-1";
  const fmt = (n: number | null) => n == null ? '—' : n.toFixed(1);
  const chip = (n: number | null) => {
    if (n == null) return 'text-gray-400';
    if (n >= 60) return 'text-green-700 dark:text-green-400';
    if (n >= 50) return 'text-gray-700 dark:text-gray-300';
    return 'text-red-600 dark:text-red-400';
  };

  return (
    <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-gray-700 dark:text-gray-200">
          Logistics Managers&apos; Index
        </h2>
        {editing ? (
          <input
            value={data.report_month}
            onChange={e => updateMonth(e.target.value)}
            className="text-[10px] font-mono text-right bg-transparent border-0 outline-none focus:ring-1 focus:ring-amber rounded px-1 w-28 text-gray-500 dark:text-gray-400"
          />
        ) : (
          <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{data.report_month || '—'}</span>
        )}
      </div>
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-1.5 px-4 font-semibold">Component</th>
            <th className="text-right py-1.5 px-4 font-semibold">Latest</th>
            <th className="text-right py-1.5 px-4 font-semibold">Prior</th>
            <th className="text-right py-1.5 px-4 font-semibold">Δ</th>
          </tr>
        </thead>
        <tbody>
          {data.components.map((c, i) => {
            const delta = (c.latest != null && c.prior != null) ? c.latest - c.prior : null;
            return (
              <tr key={c.name} className={`border-b border-gray-100 dark:border-gray-800 last:border-0 ${i === 0 ? 'bg-amber/5 dark:bg-amber/10 font-semibold' : ''}`}>
                <td className="py-1.5 px-4 text-gray-700 dark:text-gray-200">{c.name}</td>
                <td className={`py-1.5 px-4 text-right font-mono tabular-nums ${chip(c.latest)}`}>
                  {editing
                    ? <input type="number" step="0.1" value={c.latest ?? ''} onChange={e => updateComponent(i, 'latest', e.target.value)} className={cellInput} />
                    : fmt(c.latest)}
                </td>
                <td className="py-1.5 px-4 text-right font-mono tabular-nums text-gray-500 dark:text-gray-400">
                  {editing
                    ? <input type="number" step="0.1" value={c.prior ?? ''} onChange={e => updateComponent(i, 'prior', e.target.value)} className={cellInput} />
                    : fmt(c.prior)}
                </td>
                <td className={`py-1.5 px-4 text-right font-mono tabular-nums ${
                  delta == null ? 'text-gray-400' : delta > 0 ? 'text-green-600' : delta < 0 ? 'text-red-600' : 'text-gray-500'
                }`}>
                  {delta == null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="px-4 py-2 text-[9px] text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-800">
        Scale 0–100; &gt;50 = expanding, &lt;50 = contracting. Source: <a href="https://www.the-lmi.com/" target="_blank" rel="noreferrer" className="text-amber hover:text-amber-dark">the-lmi.com</a>
      </p>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Macro Research — themes from Howard Marks, Eye on the Market, Calc Risk, LMI
// ----------------------------------------------------------------------------

function ResearchCard({ manual, auto, editing, onChange }: {
  manual: EconomyData['research'];
  auto: AutoResearch | null;
  editing: boolean;
  onChange: (research: EconomyData['research']) => void;
}) {
  // Merge: for each source, auto provides title/published/url if not manually overridden.
  // Themes prefer the manual value if present, otherwise auto.
  const merge = (m: EconomyData['research'][0]): EconomyData['research'][0] => {
    if (!auto) return m;
    const a = auto.items.find(i => i.source === m.source);
    if (!a) return m;
    return {
      source: m.source,
      title: m.title || a.title,
      published: m.published || a.published,
      themes: m.themes || a.themes,
      url: m.url || a.url,
    };
  };
  const data = manual.map(merge);

  const update = (i: number, key: keyof EconomyData['research'][0], v: string) => {
    const next = [...manual];
    next[i] = { ...next[i], [key]: v };
    onChange(next);
  };
  const inputCls = "w-full bg-transparent border-0 outline-none text-[11px] focus:ring-1 focus:ring-amber rounded px-1 py-0.5";

  return (
    <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-surface-dark border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-[11px] uppercase tracking-[0.15em] font-semibold text-gray-700 dark:text-gray-200">
          Macro Read-In
        </h2>
        {auto?.fetched_at && (
          <span className="text-[9px] text-gray-400 dark:text-gray-500 font-mono">
            Auto · {new Date(auto.fetched_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {data.map((r, i) => (
          <div key={i} className="p-4">
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <div className="flex items-baseline gap-2 min-w-0 flex-1">
                <span className="text-[10px] uppercase tracking-[0.12em] font-semibold text-amber dark:text-amber-light shrink-0">
                  {r.source}
                </span>
                {editing ? (
                  <input value={r.title} onChange={e => update(i, 'title', e.target.value)} className={inputCls + ' text-gray-900 dark:text-gray-100 font-medium flex-1'} placeholder="Latest title…" />
                ) : r.title ? (
                  <span className="text-xs text-gray-900 dark:text-gray-100 font-medium truncate">{r.title}</span>
                ) : (
                  <span className="text-xs italic text-gray-400 dark:text-gray-500">No title yet</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editing ? (
                  <input value={r.published} onChange={e => update(i, 'published', e.target.value)} className={inputCls + ' text-right font-mono text-gray-500 dark:text-gray-400 w-24'} placeholder="Apr 2026" />
                ) : (
                  <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400">{r.published || ''}</span>
                )}
                <a href={r.url || '#'} target="_blank" rel="noreferrer"
                  className="text-gray-400 hover:text-amber dark:text-gray-500 dark:hover:text-amber-light"
                  title={r.url}
                >
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </div>
            </div>
            {editing ? (
              <textarea
                value={r.themes}
                onChange={e => update(i, 'themes', e.target.value)}
                rows={3}
                placeholder="Key themes / takeaways…"
                className="w-full text-[11px] text-gray-700 dark:text-gray-300 bg-transparent border border-gray-200 dark:border-gray-700 rounded px-2 py-1 leading-relaxed focus:outline-none focus:ring-1 focus:ring-amber mt-1"
              />
            ) : r.themes ? (
              <p className="text-[11px] text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{r.themes}</p>
            ) : (
              <p className="text-[11px] italic text-gray-400 dark:text-gray-500">
                Click Edit at the top to add themes from the latest piece.
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
