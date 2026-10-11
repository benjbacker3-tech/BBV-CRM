'use client';

import { useEffect, useMemo, useState } from 'react';
import { Deal, fmt, fmtNum, daysUntil, ddPill, shortDate } from '@/lib/utils';
import { DdItem, OWNERSHIP_SECTION } from '@/lib/dd-template';
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
  const nextDd = pending.map(d => d.dd_expiry).filter((x): x is string => !!x).sort()[0] ?? null;

  return (
    <>
      <div className={`page transition-all ${panel ? 'mr-[480px]' : ''}`}>
        <div className="page-header">
          <div>
            <p className="eyebrow">Sandpiper Capital LLC · Committed Portfolio</p>
            <h1 className="page-title">{greeting}, Ben</h1>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="stat">
            <p className="stat-label">Under Contract</p>
            <p className="stat-value">{pending.length}</p>
            <p className="stat-sub">{groups[1].deals.length} closed{nextDd ? ` · next DD ${shortDate(nextDd)}` : ''}</p>
          </div>
          <div className="stat">
            <p className="stat-label">Purchase Price</p>
            <p className="stat-value">{fmt(totals.price)}</p>
            <p className="stat-sub">Under contract + closed</p>
          </div>
          <div className="stat">
            <p className="stat-label">Deposits Up</p>
            <p className="stat-value">{fmt(totals.deposits)}</p>
            <p className="stat-sub">Earnest money on deals under contract</p>
          </div>
          <div className="stat">
            <p className="stat-label">Projected Fees to SPC</p>
            <p className="stat-value">{fmt(totals.oneTime)}</p>
            <p className="stat-sub">One-time · plus {fmt(totals.amFee)}/yr AM</p>
          </div>
        </div>

        <div className="card overflow-x-auto">
          <table className="table-clean">
            <thead>
              <tr>
                <th>Deal</th>
                <th className="!text-right">Price</th>
                <th className="!text-right">Size</th>
                <th className="!text-right">Return</th>
                <th className="!text-right">Deposit</th>
                <th>DD Expires</th>
                <th>Closing</th>
                <th>Checklist</th>
                <th className="!text-right">SPC Fees</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => (
                <GroupRows key={g.title} group={g} items={items} onOpen={open} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-slate-400">
          SPC Fees = acquisition + construction + leasing. * from the deal&apos;s synced model; others estimated (1.35% acq · 4% of capex at 15% of price · 1% of rent at price × YoC). Passive co-invests earn none.
        </p>
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
      <tr className="group-row">
        <td colSpan={9}>
          <span className="inline-flex items-center gap-2">{group.title} <span className="count">{group.deals.length}</span></span>
        </td>
      </tr>
      {group.deals.length === 0 && (
        <tr><td colSpan={9} className="text-slate-400 italic">None yet.</td></tr>
      )}
      {group.deals.map(d => {
        const ownership = d.ownership_pct ?? 100;
        const f = computeFees(d);
        const ddDays = daysUntil(d.dd_expiry);
        const closeDays = daysUntil(d.close_date);
        // Deals in diligence show the diligence checklist; closed deals their construction checklist.
        const checklist = items.filter(i => i.deal_id === d.id && i.list === (closed ? 'cm' : 'dd') && i.section !== OWNERSHIP_SECTION && i.status !== 'na');
        const done = checklist.filter(i => i.status === 'done').length;
        const ret = d.irr != null ? `${fmtNum(d.irr * 100, 1)}%` : d.yoc_target ? `${fmtNum(d.yoc_target * 100, 1)}%` : null;
        const retLabel = d.irr != null ? 'IRR' : 'YoC';
        return (
          <tr key={d.id} className="row">
            <td>
              <button onClick={() => onOpen(d, 'Overview')} className="text-left group">
                <span className="block text-[13px] font-medium text-slate-900 dark:text-slate-100 group-hover:text-navy group-hover:underline">{d.address || d.name}</span>
                <span className="flex items-center gap-1.5 mt-0.5 text-[11px] text-slate-500">
                  {[d.city, d.state].filter(Boolean).join(', ')}{d.market && d.market !== d.city ? ` · ${d.market}` : ''}
                  {d.stage === 'Negotiating PSA' && <span className="pill pill-amber">PSA pending</span>}
                  {ownership < 100 && <span className="pill pill-navy">{ownership}% owned</span>}
                </span>
              </button>
            </td>
            <td className="num text-slate-900 dark:text-slate-100">{d.asking_price ? fmt(d.asking_price) : '—'}</td>
            <td className="num whitespace-nowrap">
              {d.acreage ? <span className="block">{fmtNum(d.acreage, 2)} ac</span> : null}
              {d.sf ? <span className="block text-[11px] text-slate-400">{fmtNum(d.sf, 0)} SF</span> : null}
              {!d.acreage && !d.sf && '—'}
            </td>
            <td className="num whitespace-nowrap">
              {ret ? <>{ret} <span className="text-[10px] text-slate-400 font-sans">{retLabel}</span></> : '—'}
            </td>
            <td className="num text-slate-900 dark:text-slate-100">{d.deposit ? fmt(d.deposit) : '—'}</td>
            <td className="whitespace-nowrap">
              {closed ? <span className="text-slate-300">—</span> : d.dd_expiry ? (
                <span className={ddPill(ddDays)}>
                  <span className="font-mono">{shortDate(d.dd_expiry)}</span>
                  {ddDays != null && (ddDays >= 0 ? ` · ${ddDays}d` : ' · passed')}
                </span>
              ) : <span className="text-[11px] text-slate-400">{d.dd_days ? `${d.dd_days} days from PSA` : '—'}</span>}
            </td>
            <td className="whitespace-nowrap">
              {closed ? <span className="text-[11px] text-slate-500">{d.close_date ? `Closed ${shortDate(d.close_date)}` : 'Closed'}</span> : d.close_date ? (
                <span className={ddPill(closeDays)}>
                  <span className="font-mono">{shortDate(d.close_date)}</span>
                  {closeDays != null && closeDays >= 0 ? ` · ${closeDays}d` : ''}
                </span>
              ) : <span className="text-[11px] text-slate-400">{d.close_days ? `${d.close_days} days after DD` : '—'}</span>}
            </td>
            <td>
              {checklist.length > 0 ? (
                <button onClick={() => onOpen(d, 'Diligence / CM')} className="flex items-center gap-2 group" title={closed ? 'Open the construction checklist' : 'Open the diligence checklist'}>
                  <span className="progress w-20">
                    <span className="progress-bar" style={{ width: `${Math.round((done / checklist.length) * 100)}%` }} />
                  </span>
                  <span className="font-mono text-[10px] text-slate-500 group-hover:text-navy">{done}/{checklist.length}</span>
                  <span className="text-[10px] text-slate-400">{closed ? 'CM' : 'DD'}</span>
                </button>
              ) : <span className="text-slate-300">—</span>}
            </td>
            <td className="num text-slate-900 dark:text-slate-100">
              {isSponsor(d) ? <>{fmt(f.acq + f.construction + f.leasing)}{f.fromModel && <span className="text-navy" title="From the synced model">*</span>}</> : '—'}
            </td>
          </tr>
        );
      })}
      {group.deals.length > 1 && (
        <tr className="total-row">
          <td className="text-[10px] uppercase tracking-[0.12em]">Subtotal</td>
          <td className="num">{fmt(sum(d => d.asking_price || 0))}</td>
          <td className="num font-normal">{fmtNum(sum(d => d.acreage || 0), 2)} ac</td>
          <td />
          <td className="num">{closed ? '' : fmt(sum(d => d.deposit || 0))}</td>
          <td colSpan={3} />
          <td className="num">
            {fmt(sum(d => { if (!isSponsor(d)) return 0; const f = computeFees(d); return f.acq + f.construction + f.leasing; }))}
          </td>
        </tr>
      )}
    </>
  );
}

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

function LoadingSkeleton() {
  return (
    <div className="page">
      <div className="h-8 w-64 skeleton mb-6" />
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => <div key={i} className="stat h-20 animate-pulse" />)}
      </div>
      <div className="card h-64 animate-pulse" />
    </div>
  );
}
