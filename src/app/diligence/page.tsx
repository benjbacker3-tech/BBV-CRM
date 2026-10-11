'use client';

import { useEffect, useMemo, useState } from 'react';
import { Deal, fmt, daysUntil, ddChipColor } from '@/lib/utils';
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
      <div className={`p-8 transition-all ${panelDeal ? 'mr-[480px]' : ''}`}>
        <div className="flex items-end justify-between mb-6 pb-4 border-b border-gray-200">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1">Sandpiper Capital LLC · Signed PSAs &amp; Construction</p>
            <h1 className="text-xl font-medium text-gray-900 tracking-tight">Diligence / CM</h1>
          </div>
          {view === 'dd' && (
            <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
              <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />
              Include closed deals
            </label>
          )}
        </div>

        <div className="flex border-b border-gray-200 mb-5 -mt-2">
          {([['dd', 'Diligence', deals?.length], ['cm', 'Construction', cmDeals.length]] as const).map(([v, label, n]) => (
            <button
              key={v}
              onClick={() => { setView(v); setEditing(null); }}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                view === v ? 'border-navy text-navy' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
              {n != null && <span className="ml-1.5 text-[11px] font-mono text-gray-400">{n}</span>}
            </button>
          ))}
        </div>

        {view === 'cm' && <ConstructionGrid deals={cmDeals} items={cmItems} onSave={saveItem} onOpenDeal={openDeal} />}

        {view === 'dd' && deals === null && <p className="text-sm text-gray-400">Loading…</p>}
        {view === 'dd' && deals?.length === 0 && <p className="text-sm text-gray-400">No deals under contract. A deal&apos;s checklist starts when it moves to Under Contract.</p>}

        {view === 'dd' && !!deals?.length && (
          <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
            <table className="text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-200 align-top">
                  <th className="sticky left-0 z-10 bg-white text-left px-3 py-3 min-w-[210px] font-medium text-gray-500">Item</th>
                  {deals.map(d => {
                    const dd = daysUntil(d.dd_expiry);
                    const close = daysUntil(d.close_date);
                    const dealItems = items.filter(i => i.deal_id === d.id && i.section !== OWNERSHIP_SECTION && i.status !== 'na');
                    const done = dealItems.filter(i => i.status === 'done').length;
                    return (
                      <th key={d.id} className={`${colW} text-left px-3 py-3 border-l border-gray-100 font-normal`}>
                        <button onClick={() => openDeal(d.id)} className="text-sm font-semibold text-gray-900 hover:text-navy hover:underline text-left">{d.name}</button>
                        <p className="text-[11px] text-gray-500">{[d.city, d.state].filter(Boolean).join(', ')}{d.stage === 'Closed' ? ' · Closed' : d.stage === 'Negotiating PSA' ? ' · PSA pending' : ''}</p>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {d.dd_expiry && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ddChipColor(dd)}`}>DD {d.dd_expiry}</span>}
                          {d.close_date && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ddChipColor(close)}`}>Close {d.close_date}</span>}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 font-mono">{done}/{dealItems.length} done</p>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map(group => (
                  <Section key={group.section} title={group.section} span={deals.length}>
                    {group.rows.map(r => (
                      <tr key={r.key} className="border-b border-gray-100 align-top">
                        <td className="sticky left-0 z-10 bg-white px-3 py-2 text-gray-700">{r.label}</td>
                        {deals.map(d => {
                          const it = cell(d.id, r.key);
                          return (
                            <td key={d.id} className={`${colW} border-l border-gray-100 p-0`}>
                              {it ? (
                                <GridCell item={it} editing={editing === it.id} onEdit={open => setEditing(open ? it.id : null)} onSave={saveItem} />
                              ) : <span className="block px-3 py-2 text-gray-300">—</span>}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Section>
                ))}

                <Section title={OWNERSHIP_SECTION} span={deals.length}>
                  <tr className="border-b border-gray-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-2 text-gray-700">Received</td>
                    {deals.map(d => {
                      const om = items.filter(i => i.deal_id === d.id && i.section === OWNERSHIP_SECTION && i.status !== 'na');
                      const got = om.filter(i => i.status === 'done').length;
                      return (
                        <td key={d.id} className={`${colW} border-l border-gray-100 px-3 py-2`}>
                          <button onClick={() => openDeal(d.id)} className="font-mono text-gray-700 hover:underline">{got}/{om.length}</button>
                          <span className="text-[10px] text-gray-400 ml-1">open the deal to check off</span>
                        </td>
                      );
                    })}
                  </tr>
                </Section>

                <Section title="Diligence Spend (committed)" span={deals.length}>
                  {costCategories.map(cat => (
                    <tr key={cat} className="border-b border-gray-100">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2 text-gray-700">{cat}</td>
                      {deals.map(d => {
                        const lines = costs.filter(c => c.deal_id === d.id && c.category === cat && c.status !== 'declined');
                        const committed = lines.filter(c => c.status !== 'proposal');
                        const proposals = lines.filter(c => c.status === 'proposal');
                        return (
                          <td key={d.id} className={`${colW} border-l border-gray-100 px-3 py-2 font-mono`}>
                            {committed.length ? fmt(committed.reduce((s, c) => s + costAmount(c), 0)) : <span className="text-gray-300">—</span>}
                            {proposals.length > 0 && (
                              <span className="ml-1.5 text-[10px] text-gray-400 font-sans">
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
                    <tr key={k} className="border-b border-gray-100 bg-gray-50/60">
                      <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 font-medium text-gray-800 capitalize">Total {k}</td>
                      {deals.map(d => (
                        <td key={d.id} className={`${colW} border-l border-gray-100 px-3 py-2 font-mono font-semibold text-gray-900`}>
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
        <p className="mt-3 text-[11px] text-gray-400">
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
