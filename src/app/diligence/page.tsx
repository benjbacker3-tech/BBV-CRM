'use client';

import { useEffect, useMemo, useState } from 'react';
import { Deal, fmt, daysUntil, ddChipColor } from '@/lib/utils';
import {
  DD_SECTIONS, DD_STATUSES, DD_STATUS_LABEL, DdItem, DdStatus, DdCost, OWNERSHIP_SECTION, costAmount, costTotals,
} from '@/lib/dd-template';
import { STATUS_STYLE } from '@/components/deal-tabs/DiligenceTab';
import DealDetailPanel from '@/components/DealDetailPanel';

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

// Cross-deal diligence tracker: one column per deal, laid out like the
// SPC Diligence Checklist workbook (checklist on top, spend tracker below).
export default function DiligencePage() {
  const [showClosed, setShowClosed] = useState(false);
  const [deals, setDeals] = useState<GridDeal[] | null>(null);
  const [items, setItems] = useState<DdItem[]>([]);
  const [costs, setCosts] = useState<DdCost[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [panelDeal, setPanelDeal] = useState<Deal | null>(null);

  const load = () =>
    fetch(`/api/dd/overview${showClosed ? '?closed=1' : ''}`).then(r => r.json()).then(data => {
      setDeals(data.deals || []);
      setItems(data.items || []);
      setCosts(data.costs || []);
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
    setItems(prev => prev.map(i => (i.id === id ? { ...i, ...patch } : i)));
    await fetch(`/api/dd/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  };

  const openDeal = async (id: number) => {
    const all: Deal[] = await fetch('/api/deals').then(r => r.json());
    setPanelDeal(all.find(d => d.id === id) ?? null);
  };

  const colW = 'min-w-[220px] w-[220px]';

  return (
    <>
      <div className={`p-8 transition-all ${panelDeal ? 'mr-[480px]' : ''}`}>
        <div className="flex items-end justify-between mb-6 pb-4 border-b border-gray-200">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1">Sandpiper Capital LLC · Signed PSAs</p>
            <h1 className="text-xl font-medium text-gray-900 tracking-tight">Diligence</h1>
          </div>
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showClosed} onChange={e => setShowClosed(e.target.checked)} />
            Include closed deals
          </label>
        </div>

        {deals === null && <p className="text-sm text-gray-400">Loading…</p>}
        {deals?.length === 0 && <p className="text-sm text-gray-400">No deals under contract. A deal&apos;s checklist starts when it moves to Under Contract.</p>}

        {!!deals?.length && (
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
        <p className="mt-3 text-[11px] text-gray-400">Click a cell to update it. Proposals, invoices and payments are entered on each deal&apos;s Diligence tab (click the deal name).</p>
      </div>

      {panelDeal && (
        <DealDetailPanel
          deal={panelDeal}
          initialTab="Diligence"
          onClose={() => { setPanelDeal(null); load(); }}
          onUpdate={updated => { setPanelDeal(updated); load(); }}
          onDelete={() => { setPanelDeal(null); load(); }}
        />
      )}
    </>
  );
}

function Section({ title, span, children }: { title: string; span: number; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-navy/5 border-b border-gray-200">
        <td className="sticky left-0 z-10 bg-[#EEF1F5] px-3 py-1.5 text-[10px] uppercase tracking-[0.12em] font-semibold text-navy">{title}</td>
        <td colSpan={span} className="bg-[#EEF1F5]" />
      </tr>
      {children}
    </>
  );
}

function GridCell({ item, editing, onEdit, onSave }: {
  item: DdItem;
  editing: boolean;
  onEdit: (open: boolean) => void;
  onSave: (id: number, patch: Partial<DdItem>) => void;
}) {
  const text = [item.vendor, item.note].filter(Boolean).join(' · ');
  if (!editing) {
    return (
      <button onClick={() => onEdit(true)} className={`w-full text-left px-3 py-2 hover:bg-gray-50 ${item.status === 'na' ? 'opacity-50' : ''}`}>
        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_STYLE[item.status]}`}>{DD_STATUS_LABEL[item.status]}</span>
        {item.due_date && <span className="ml-1.5 font-mono text-[10px] text-gray-400">due {item.due_date}</span>}
        {text && <span className="block mt-0.5 text-[11px] text-gray-600 line-clamp-2 whitespace-pre-line">{text}</span>}
      </button>
    );
  }
  const blur = (field: 'vendor' | 'note') => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const v = e.target.value.trim() || null;
    if (v !== (item[field] ?? null)) onSave(item.id, { [field]: v });
  };
  const field = 'text-[11px] border border-gray-200 rounded px-1.5 py-1 w-full focus:outline-none focus:ring-1 focus:ring-navy';
  return (
    <div className="px-2 py-2 space-y-1 bg-gray-50">
      <div className="flex gap-1">
        {DD_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => onSave(item.id, { status: s as DdStatus })}
            className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${item.status === s ? STATUS_STYLE[s] + ' ring-1 ring-navy/40' : 'text-gray-400 hover:bg-gray-100'}`}
          >
            {DD_STATUS_LABEL[s]}
          </button>
        ))}
      </div>
      <input autoFocus defaultValue={item.vendor ?? ''} onBlur={blur('vendor')} placeholder="Vendor / who" className={field} />
      <textarea defaultValue={item.note ?? ''} onBlur={blur('note')} rows={2} placeholder="Where it stands" className={`${field} resize-y`} />
      <button onClick={() => onEdit(false)} className="text-[10px] text-navy font-medium">Done</button>
    </div>
  );
}
