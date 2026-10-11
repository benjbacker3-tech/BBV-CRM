'use client';

import { useEffect, useMemo, useState } from 'react';
import { Deal, fmt, daysUntil, ddPill, shortDate } from '@/lib/utils';
import {
  DD_SECTIONS, DdItem, DdCost, OWNERSHIP_SECTION, costAmount, costTotals,
} from '@/lib/dd-template';
import { Section, GridCell, colW } from '@/components/ChecklistGrid';
import DealDetailPanel from '@/components/DealDetailPanel';
import ConstructionGrid from '@/components/ConstructionGrid';

interface GridDeal {
  id: number;
  name: string;
  address: string;
  city: string;
  state: string | null;
  stage: string;
  dd_expiry: string | null;
  close_date: string | null;
}

interface Row { section: string; key: string; label: string }

// Cross-deal trackers, one column per deal. Diligence: laid out like the SPC Diligence
// Checklist workbook (checklist on top, spend tracker below). Construction: the
// Construction Mgmt sheet for every deal with a construction checklist.
export default function DiligencePage() {
  const [view, setView] = useState<'dd' | 'cm'>('dd');
  const [showClosed, setShowClosed] = useState(false);
  const [deals, setDeals] = useState<GridDeal[] | null>(null);
  const [items, setItems] = useState<DdItem[]>([]);
  const [costs, setCosts] = useState<DdCost[]>([]);
  const [cmDeals, setCmDeals] = useState<GridDeal[]>([]);
  const [cmItems, setCmItems] = useState<DdItem[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [panelDeal, setPanelDeal] = useState<Deal | null>(null);

  const load = () =>
    fetch(`/api/dd/overview${showClosed ? '?closed=1' : ''}`).then(r => r.json()).then(data => {
      setDeals(data.deals || []);
      setItems(data.items || []);
      setCosts(data.costs || []);
      setCmDeals(data.cmDeals || []);
      setCmItems(data.construction || []);
    });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [showClosed]);

  // Template rows in order, then any lines added by hand on a deal (per section).
  const rows = useMemo(() => {
    const seen = new Map<string, Row>();
    for (const it of [...items].sort((a, b) => a.sort - b.sort)) {
      if (it.section === OWNERSHIP_SECTION) continue;
      const key = it.item_key.startsWith('custom-') ? `${it.section}:${it.label.toLowerCase()}` : it.item_key;
      if (!seen.has(key)) seen.set(key, { section: it.section, key, label: it.label });
    }
    return DD_SECTIONS.filter(s => s !== OWNERSHIP_SECTION).map(s => ({ section: s, rows: Array.from(seen.values()).filter(r => r.section === s) }));
  }, [items]);

  const cell = (dealId: number, key: string) =>
    items.find(i => i.deal_id === dealId && (i.item_key === key || (i.item_key.startsWith('custom-') && `${i.section}:${i.label.toLowerCase()}` === key)));

  const costCategories = useMemo(() => Array.from(new Set(costs.filter(c => c.status !== 'declined').map(c => c.category))).sort(), [costs]);

  const saveItem = async (id: number, patch: Partial<DdItem>) => {
    const apply = (prev: DdItem[]) => prev.map(i => (i.id === id ? { ...i, ...patch } : i));
    setItems(apply);
    setCmItems(apply);
    await fetch(`/api/dd/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  };

  const openDeal = async (id: number) => {
    const all: Deal[] = await fetch('/api/deals').then(r => r.json());
    setPanelDeal(all.find(d => d.id === id) ?? null);
  };

  return (
    <>
      <div className={`page !max-w-none transition-all ${panelDeal ? 'mr-[480px]' : ''}`}>
        <div className="page-header">
          <div>
            <p className="eyebrow">Sandpiper Capital LLC · Signed PSAs &amp; Construction</p>
            <h1 className="page-title">Diligence / CM</h1>
            <p className="page-sub">{view === 'dd' ? 'Where every deal under contract stands on the SPC diligence checklist, and what it has cost so far.' : 'Construction oversight for every project with a construction checklist, with contract deadlines.'}</p>
          </div>
          {view === 'dd' && (
            <label className="btn-secondary cursor-pointer select-none">
              <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />
              Include closed deals
            </label>
          )}
        </div>

        <div className="tabs mb-5">
          {([['dd', 'Diligence', deals?.length], ['cm', 'Construction', cmDeals.length]] as const).map(([v, label, n]) => (
            <button
              key={v}
              onClick={() => { setView(v); setEditing(null); }}
              className={`tab inline-flex items-center gap-2 ${view === v ? 'tab-active' : ''}`}
            >
              {label}
              {n != null && <span className="count">{n}</span>}
            </button>
          ))}
        </div>

        {view === 'cm' && <ConstructionGrid deals={cmDeals} items={cmItems} onSave={saveItem} onOpenDeal={openDeal} />}

        {view === 'dd' && deals === null && <p className="text-sm text-slate-400">Loading…</p>}
        {view === 'dd' && deals?.length === 0 && <p className="card px-6 py-10 text-center text-sm text-slate-500">No deals under contract. A deal&apos;s checklist starts when it moves to Under Contract.</p>}

        {view === 'dd' && !!deals?.length && (
          <div className="card overflow-x-auto w-fit max-w-full">
            <table className="text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 align-top">
                  <th className="sticky left-0 z-10 bg-white dark:bg-slate-900 text-left px-4 py-3.5 min-w-[220px] text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-400">Item</th>
                  {deals.map(d => {
                    const dd = daysUntil(d.dd_expiry);
                    const close = daysUntil(d.close_date);
                    const dealItems = items.filter(i => i.deal_id === d.id && i.section !== OWNERSHIP_SECTION && i.status !== 'na');
                    const done = dealItems.filter(i => i.status === 'done').length;
                    return (
                      <th key={d.id} className={`${colW} text-left px-3 py-3.5 border-l border-slate-100 dark:border-slate-800 font-normal`}>
                        <button onClick={() => openDeal(d.id)} className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-navy hover:underline text-left">{d.name}</button>
                        <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                          {[d.city, d.state].filter(Boolean).join(', ')}
                          {d.stage === 'Closed' && <span className="pill pill-green">Closed</span>}
                          {d.stage === 'Negotiating PSA' && <span className="pill pill-amber">PSA pending</span>}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {d.dd_expiry && <span className={ddPill(dd)}>DD <span className="font-mono">{shortDate(d.dd_expiry)}</span>{dd != null && dd >= 0 ? ` · ${dd}d` : ''}</span>}
                          {d.close_date && <span className={ddPill(close)}>Close <span className="font-mono">{shortDate(d.close_date)}</span></span>}
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="progress w-20"><span className="progress-bar" style={{ width: `${dealItems.length ? Math.round((done / dealItems.length) * 100) : 0}%` }} /></span>
                          <span className="text-[10px] text-slate-400 font-mono">{done}/{dealItems.length}</span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(group => (
                  <Section key={group.section} title={group.section} span={deals.length}>
                    {group.rows.map(r => (
                      <tr key={r.key} className="border-b border-slate-100 dark:border-slate-800 align-top">
                        <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.label}</td>
                        {deals.map(d => {
                          const it = cell(d.id, r.key);
                          return (
                            <td key={d.id} className={`${colW} border-l border-slate-100 dark:border-slate-800 p-0`}>
                              {it ? (
                                <GridCell item={it} editing={editing === it.id} onEdit={open => setEditing(open ? it.id : null)} onSave={saveItem} />
                              ) : <span className="block px-3 py-2.5 text-slate-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Section>
                ))}

                <Section title={OWNERSHIP_SECTION} span={deals.length}>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-2.5 text-slate-700 dark:text-slate-300">Received</td>
                    {deals.map(d => {
                      const om = items.filter(i => i.deal_id === d.id && i.section === OWNERSHIP_SECTION && i.status !== 'na');
                      const got = om.filter(i => i.status === 'done').length;
                      return (
                        <td key={d.id} className={`${colW} border-l border-slate-100 dark:border-slate-800 px-3 py-2.5`}>
                          <button onClick={() => openDeal(d.id)} className="font-mono text-slate-700 dark:text-slate-300 hover:underline">{got}/{om.length}</button>
                          <span className="text-[10px] text-slate-400 ml-1.5">open the deal to check off</span>
                        </td>
                      );
                    })}
                  </tr>
                </Section>

                <Section title="Diligence Spend (committed)" span={deals.length}>
                  {costCategories.map(cat => (
                    <tr key={cat} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-2.5 text-slate-700 dark:text-slate-300">{cat}</td>
                      {deals.map(d => {
                        const lines = costs.filter(c => c.deal_id === d.id && c.category === cat && c.status !== 'declined');
                        const committed = lines.filter(c => c.status !== 'proposal');
                        const proposals = lines.filter(c => c.status === 'proposal');
                        return (
                          <td key={d.id} className={`${colW} border-l border-slate-100 dark:border-slate-800 px-3 py-2.5 font-mono tabular-nums text-slate-800 dark:text-slate-200`}>
                            {committed.length ? fmt(committed.reduce((s, c) => s + costAmount(c), 0)) : <span className="text-slate-300">—</span>}
                            {proposals.length > 0 && (
                              <span className="ml-1.5 text-[10px] text-slate-400 font-sans">
                                {proposals.length} bid{proposals.length > 1 ? 's' : ''} {fmt(Math.min(...proposals.map(costAmount)))}
                                {proposals.length > 1 ? `–${fmt(Math.max(...proposals.map(costAmount)))}` : ''}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {(['committed', 'invoiced', 'paid'] as const).map(k => (
                    <tr key={k} className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
                      <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-200 capitalize">Total {k}</td>
                      {deals.map(d => (
                        <td key={d.id} className={`${colW} border-l border-slate-100 dark:border-slate-800 px-3 py-2.5 font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100`}>
                          {fmt(costTotals(costs.filter(c => c.deal_id === d.id))[k])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Section>
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          Click a cell to update it. {view === 'dd'
            ? 'Proposals, invoices and payments are entered on each deal’s Diligence / CM tab (click the deal name).'
            : 'Add contract items or due dates on each deal’s Diligence / CM tab (click the deal name).'}
        </p>
      </div>

      {panelDeal && (
        <DealDetailPanel
          deal={panelDeal}
          initialTab="Diligence / CM"
          onClose={() => { setPanelDeal(null); load(); }}
          onUpdate={updated => { setPanelDeal(updated); load(); }}
          onDelete={() => { setPanelDeal(null); load(); }}
        />
      )}
    </>
  );
}
