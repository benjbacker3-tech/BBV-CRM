'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Deal, fmt, fmtNum, daysUntil, ddChipColor } from '@/lib/utils';
import { DdItem, DD_SECTIONS, CM_SECTIONS, OWNERSHIP_SECTION } from '@/lib/dd-template';
import DealDetailPanel, { Tab } from '@/components/DealDetailPanel';

// SPC's default fee stack when SPC is the sponsor (source: CentrePoint term sheet).
// A deal where SPC isn't a sponsor (co-invest, passive LP) doesn't earn these.
const ACQ_FEE_PCT = 0.0135;         // 1.35% of purchase price at closing
const AM_FEE_PCT = 0.01;            // 1% of invested equity per year
const CONSTRUCTION_FEE_PCT = 0.04;  // 4% of major capex
const LEASING_FEE_PCT = 0.01;       // 1% of net rent (i.e. leasing commission)
// Proxies used until we track capex + annual rent per deal:
//   capex ≈ 15% of purchase price (typical light value-add IOS budget)
//   annual net rent ≈ purchase price × stabilized YoC
const CAPEX_PROXY_PCT = 0.15;

const TODOS_PER_DEAL = 6;

interface Group { title: 'Under Contract' | 'Closed'; deals: Deal[] }

export default function Dashboard() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [inDd, setInDd] = useState<Set<number>>(new Set());
  const [items, setItems] = useState<DdItem[]>([]);
  const [panel, setPanel] = useState<{ deal: Deal; tab: Tab } | null>(null);

  const load = () => Promise.all([
    fetch('/api/deals').then(r => r.json()),
    fetch('/api/dd/overview').then(r => r.json()),
  ]).then(([all, dd]: [Deal[], { deals: { id: number }[]; items: DdItem[]; construction: DdItem[] }]) => {
    setDeals(all);
    setInDd(new Set(dd.deals.map(d => d.id)));
    // Diligence lines (list dd) and construction lines (list cm) side by side.
    setItems([...(dd.items || []), ...(dd.construction || [])]);
  });

  useEffect(() => { load(); }, []);

  // Under Contract = signed PSA, or still negotiating with diligence already started.
  const groups = useMemo<Group[]>(() => {
    const list = deals || [];
    const byClose = (a: Deal, b: Deal) => (a.close_date || a.dd_expiry || '9999').localeCompare(b.close_date || b.dd_expiry || '9999');
    return [
      { title: 'Under Contract', deals: list.filter(d => d.stage === 'Under Contract' || (d.stage === 'Negotiating PSA' && inDd.has(d.id))).sort(byClose) },
      { title: 'Closed', deals: list.filter(d => d.stage === 'Closed').sort((a, b) => byClose(b, a)) },
    ];
  }, [deals, inDd]);

  const tracked = groups.flatMap(g => g.deals);
  const pending = groups[0].deals;

  const totals = useMemo(() => {
    const t = { price: 0, deposits: 0, oneTime: 0, amFee: 0 };
    for (const d of tracked) {
      t.price += d.asking_price || 0;
      if (isSponsor(d)) {
        const f = computeFees(d);
        t.oneTime += f.acq + f.construction + f.leasing;
        t.amFee += f.am;
      }
    }
    for (const d of pending) t.deposits += d.deposit || 0;
    return t;
  }, [tracked, pending]);

  if (!deals) return <LoadingSkeleton />;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const open = (deal: Deal, tab: Tab) => setPanel({ deal, tab });

  const markDone = async (id: number) => {
    setItems(prev => prev.map(i => (i.id === id ? { ...i, status: 'done' } : i)));
    await fetch(`/api/dd/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done' }) });
  };

  return (
    <>
      <div className={`p-8 max-w-[1400px] transition-all ${panel ? 'mr-[480px]' : ''}`}>
        <div className="mb-5 pb-4 border-b border-gray-200">
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1">Sandpiper Capital LLC · Committed Portfolio</p>
          <h1 className="text-xl font-medium text-gray-900 tracking-tight">{greeting}, Ben</h1>
        </div>

        <div className="grid grid-cols-4 gap-3 mb-6">
          <SummaryTile label="Under Contract" value={String(pending.length)} sub={`${groups[1].deals.length} closed`} />
          <SummaryTile label="Purchase Price" value={fmt(totals.price)} sub="Under contract + closed" />
          <SummaryTile label="Deposits Up" value={fmt(totals.deposits)} sub="Earnest money on deals under contract" />
          <SummaryTile label="Projected Fees to SPC" value={fmt(totals.oneTime)} sub={`one-time · plus ${fmt(totals.amFee)}/yr AM`} />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto mb-7">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-gray-500 border-b border-gray-200 bg-gray-50/50 text-[9px] uppercase tracking-wide">
                <th className="text-left py-2 px-3 font-semibold">Deal</th>
                <th className="text-right py-2 px-3 font-semibold">Price</th>
                <th className="text-right py-2 px-3 font-semibold">Size</th>
                <th className="text-right py-2 px-3 font-semibold">Return</th>
                <th className="text-right py-2 px-3 font-semibold">Deposit</th>
                <th className="text-left py-2 px-3 font-semibold">DD Expires</th>
                <th className="text-left py-2 px-3 font-semibold">Closing</th>
                <th className="text-left py-2 px-3 font-semibold">Checklist</th>
                <th className="text-right py-2 px-3 font-semibold">SPC Fees</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <GroupRows key={g.title} group={g} items={items} onOpen={open} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="-mt-6 mb-8 text-[10px] text-gray-400">
          SPC Fees = acquisition + construction + leasing. * from the deal&apos;s synced model; others estimated (1.35% acq · 4% of capex at 15% of price · 1% of rent at price × YoC). Passive co-invests earn none.
        </p>

        <ToDos deals={[...pending, ...groups[1].deals]} items={items} onOpen={d => open(d, 'Diligence / CM')} onDone={markDone} />
      </div>

      {panel && (
        <DealDetailPanel
          key={`${panel.deal.id}-${panel.tab}`}
          deal={panel.deal}
          initialTab={panel.tab}
          onClose={() => { setPanel(null); load(); }}
          onUpdate={updated => { setPanel(p => (p ? { ...p, deal: updated } : p)); load(); }}
          onDelete={() => { setPanel(null); load(); }}
        />
      )}
    </>
  );
}

function GroupRows({ group, items, onOpen }: { group: Group; items: DdItem[]; onOpen: (d: Deal, tab: Tab) => void }) {
  const closed = group.title === 'Closed';
  const sum = (f: (d: Deal) => number) => group.deals.reduce((s, d) => s + f(d), 0);
  return (
    <>
      <tr className="bg-[#EEF1F5] border-b border-gray-200">
        <td colSpan={9} className="py-1.5 px-3 text-[10px] uppercase tracking-[0.12em] font-semibold text-navy">
          {group.title} <span className="text-gray-400 font-mono normal-case tracking-normal">({group.deals.length})</span>
        </td>
      </tr>
      {group.deals.length === 0 && (
        <tr className="border-b border-gray-100"><td colSpan={9} className="py-2 px-3 text-gray-400 italic">None yet.</td></tr>
      )}
      {group.deals.map(d => {
        const ownership = d.ownership_pct ?? 100;
        const f = computeFees(d);
        const ddDays = daysUntil(d.dd_expiry);
        const closeDays = daysUntil(d.close_date);
        // Deals in diligence show the diligence checklist; closed deals their construction checklist.
        const checklist = items.filter(i => i.deal_id === d.id && i.list === (closed ? 'cm' : 'dd') && i.section !== OWNERSHIP_SECTION && i.status !== 'na');
        const done = checklist.filter(i => i.status === 'done').length;
        const ret = d.irr != null ? `${fmtNum(d.irr * 100, 1)}% IRR` : d.yoc_target ? `${fmtNum(d.yoc_target * 100, 1)}% YoC` : '—';
        return (
          <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50/60">
            <td className="py-1.5 px-3">
              <button onClick={() => onOpen(d, 'Overview')} className="font-medium text-gray-900 hover:text-navy hover:underline text-left">{d.address || d.name}</button>
              <span className="text-gray-500 ml-1.5">{[d.city, d.state].filter(Boolean).join(', ')}{d.market && d.market !== d.city ? ` · ${d.market}` : ''}</span>
              {d.stage === 'Negotiating PSA' && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 font-medium">PSA pending</span>}
              {ownership < 100 && <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-navy/10 text-navy font-medium">{ownership}%</span>}
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular-nums text-gray-900">{d.asking_price ? fmt(d.asking_price) : '—'}</td>
            <td className="py-1.5 px-3 text-right font-mono tabular-nums text-gray-700 whitespace-nowrap">
              {[d.acreage ? `${fmtNum(d.acreage, 2)} ac` : null, d.sf ? `${fmtNum(d.sf, 0)} SF` : null].filter(Boolean).join(' · ') || '—'}
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular-nums text-gray-700 whitespace-nowrap">{ret}</td>
            <td className="py-1.5 px-3 text-right font-mono tabular-nums text-gray-900">{d.deposit ? fmt(d.deposit) : '—'}</td>
            <td className="py-1.5 px-3 whitespace-nowrap">
              {closed ? <span className="text-gray-300">—</span> : d.dd_expiry ? (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ddChipColor(ddDays)}`}>
                  {shortDate(d.dd_expiry)}{ddDays != null && ddDays >= 0 ? ` · ${ddDays}d` : ' · passed'}
                </span>
              ) : <span className="text-gray-400">{d.dd_days ? `${d.dd_days} days from PSA` : '—'}</span>}
            </td>
            <td className="py-1.5 px-3 whitespace-nowrap">
              {closed ? <span className="text-gray-600">{d.close_date ? `Closed ${shortDate(d.close_date)}` : 'Closed'}</span> : d.close_date ? (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ddChipColor(closeDays)}`}>
                  {shortDate(d.close_date)}{closeDays != null && closeDays >= 0 ? ` · ${closeDays}d` : ''}
                </span>
              ) : <span className="text-gray-400">{d.close_days ? `${d.close_days} days after DD` : '—'}</span>}
            </td>
            <td className="py-1.5 px-3">
              {checklist.length > 0 ? (
                <button onClick={() => onOpen(d, 'Diligence / CM')} className="flex items-center gap-1.5 group" title={closed ? 'Open the construction checklist' : 'Open the diligence checklist'}>
                  <span className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <span className="block h-full bg-navy rounded-full" style={{ width: `${Math.round((done / checklist.length) * 100)}%` }} />
                  </span>
                  <span className="font-mono text-[10px] text-gray-500 group-hover:text-navy">{done}/{checklist.length}</span>
                </button>
              ) : <span className="text-gray-300">—</span>}
            </td>
            <td className="py-1.5 px-3 text-right font-mono tabular-nums text-gray-900">
              {isSponsor(d) ? <>{fmt(f.acq + f.construction + f.leasing)}{f.fromModel && <span className="text-navy" title="From the synced model">*</span>}</> : '—'}
            </td>
          </tr>
        );
      })}
      {group.deals.length > 1 && (
        <tr className="border-b border-gray-200 bg-gray-50/60 text-gray-700">
          <td className="py-1.5 px-3 text-[9px] uppercase tracking-wide font-semibold">Subtotal</td>
          <td className="py-1.5 px-3 text-right font-mono font-semibold tabular-nums">{fmt(sum(d => d.asking_price || 0))}</td>
          <td className="py-1.5 px-3 text-right font-mono tabular-nums">{fmtNum(sum(d => d.acreage || 0), 2)} ac</td>
          <td />
          <td className="py-1.5 px-3 text-right font-mono font-semibold tabular-nums">{closed ? '' : fmt(sum(d => d.deposit || 0))}</td>
          <td colSpan={3} />
          <td className="py-1.5 px-3 text-right font-mono font-semibold tabular-nums">
            {fmt(sum(d => { if (!isSponsor(d)) return 0; const f = computeFees(d); return f.acq + f.construction + f.leasing; }))}
          </td>
        </tr>
      )}
    </>
  );
}

// Next open lines per deal: dated ones first (soonest), then in-progress, then in checklist order.
function ToDos({ deals, items, onOpen, onDone }: {
  deals: Deal[];
  items: DdItem[];
  onOpen: (d: Deal) => void;
  onDone: (id: number) => void;
}) {
  const listFor = (d: Deal) => (d.stage === 'Closed' ? 'cm' : 'dd');
  const withTodos = deals.filter(d => items.some(i => i.deal_id === d.id && i.list === listFor(d)));
  if (!withTodos.length) return null;
  const sectionRank = (s: string) => DD_SECTIONS.indexOf(s) + CM_SECTIONS.indexOf(s);

  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <h2 className="text-[10px] uppercase tracking-[0.15em] font-semibold text-gray-700">To-Dos</h2>
        <Link href="/diligence" className="text-[11px] text-navy hover:underline">Full checklist →</Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {withTodos.map(d => {
          const openItems = items
            .filter(i => i.deal_id === d.id && i.list === listFor(d) && i.section !== OWNERSHIP_SECTION && (i.status === 'open' || i.status === 'in_progress'))
            .sort((a, b) =>
              (a.due_date || '9999').localeCompare(b.due_date || '9999')
              || (a.status === 'in_progress' ? 0 : 1) - (b.status === 'in_progress' ? 0 : 1)
              || sectionRank(a.section) - sectionRank(b.section)
              || a.sort - b.sort);
          const om = items.filter(i => i.deal_id === d.id && i.section === OWNERSHIP_SECTION && i.status !== 'na');
          const omDone = om.filter(i => i.status === 'done').length;
          return (
            <div key={d.id} className="bg-white rounded-lg border border-gray-200">
              <button onClick={() => onOpen(d)} className="w-full flex items-baseline justify-between px-3 py-2 border-b border-gray-100 hover:bg-gray-50 text-left">
                <span className="text-xs font-semibold text-gray-900">{d.address || d.name}</span>
                <span className="text-[10px] text-gray-400">{openItems.length} open · {listFor(d) === 'cm' ? 'construction' : `diligence · ownership docs ${omDone}/${om.length}`}</span>
              </button>
              <ul className="divide-y divide-gray-50">
                {openItems.slice(0, TODOS_PER_DEAL).map(i => {
                  const due = daysUntil(i.due_date);
                  return (
                    <li key={i.id} className="flex items-start gap-2 px-3 py-1.5">
                      <input type="checkbox" onChange={() => onDone(i.id)} title="Mark done" className="mt-0.5 cursor-pointer" />
                      <button onClick={() => onOpen(d)} className="flex-1 min-w-0 text-left">
                        <span className="text-[11px] text-gray-800 hover:text-navy">{i.label}</span>
                        {i.status === 'in_progress' && <span className="ml-1.5 text-[9px] text-blue-600">in progress</span>}
                        {(i.vendor || i.note) && <span className="block text-[10px] text-gray-500 truncate">{[i.vendor, i.note].filter(Boolean).join(' · ')}</span>}
                      </button>
                      {i.due_date && <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 ${ddChipColor(due)}`}>{shortDate(i.due_date)}</span>}
                    </li>
                  );
                })}
                {openItems.length > TODOS_PER_DEAL && (
                  <li><button onClick={() => onOpen(d)} className="px-3 py-1.5 text-[10px] text-navy hover:underline">+{openItems.length - TODOS_PER_DEAL} more on the checklist</button></li>
                )}
                {!openItems.length && <li className="px-3 py-2 text-[11px] text-gray-400">Checklist complete.</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return `${m}/${d}${y !== new Date().getFullYear() ? `/${String(y).slice(2)}` : ''}`;
};

function isSponsor(d: Deal): boolean {
  // SPC earns fees when SPC (via a JV entity) is the sponsor. A Closed deal we
  // co-invested in as a passive LP shows an ownership_pct < 100 and no fees.
  return (d.ownership_pct ?? 100) === 100;
}

// Real sponsor fees from the deal's model when it has been synced; otherwise the proxies above.
// The model's AM fee covers the whole hold, so it's annualized with the model's hold period.
function computeFees(d: Deal) {
  if (d.model_synced_at && (d.fee_acq != null || d.fee_am != null)) {
    const years = d.hold_months ? d.hold_months / 12 : null;
    return {
      acq: d.fee_acq || 0,
      am: d.fee_am && years ? d.fee_am / years : (d.equity_required || 0) * AM_FEE_PCT,
      construction: d.fee_construction || 0,
      leasing: d.fee_leasing || 0,
      fromModel: true,
    };
  }
  const price = d.asking_price || 0;
  const equity = d.equity_required || 0;
  const yoc = d.yoc_target || 0;
  const capexProxy = price * CAPEX_PROXY_PCT;         // rough capex budget
  const annualRentProxy = price * yoc;                // stabilized rent proxy (price × YoC)
  return {
    acq: price * ACQ_FEE_PCT,
    am: equity * AM_FEE_PCT,
    construction: capexProxy * CONSTRUCTION_FEE_PCT,
    leasing: annualRentProxy * LEASING_FEE_PCT,
    fromModel: false,
  };
}

function SummaryTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
      <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-0.5">{label}</p>
      <p className="text-lg font-mono font-semibold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-8 max-w-[1400px]">
      <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-100 p-4 h-20 animate-pulse" />
        ))}
      </div>
      <div className="h-64 bg-gray-100 rounded animate-pulse" />
    </div>
  );
}
