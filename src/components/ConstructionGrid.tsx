'use client';

import { useMemo, useState } from 'react';
import { daysUntil, ddChipColor } from '@/lib/utils';
import { CM_SECTIONS, CONTRACT_SECTION, DdItem } from '@/lib/dd-template';
import { Section, GridCell, colW } from './ChecklistGrid';

interface GridDeal { id: number; name: string; city: string; state: string | null; stage: string }

const UPCOMING_DAYS = 21;

// Cross-deal construction tracker: one column per deal with a construction checklist,
// rows from the Construction Mgmt template. Contract Items differ per deal, so each
// deal's open ones are stacked in a single row.
export default function ConstructionGrid({ deals, items, onSave, onOpenDeal }: {
  deals: GridDeal[];
  items: DdItem[];
  onSave: (id: number, patch: Partial<DdItem>) => void;
  onOpenDeal: (id: number) => void;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  const edit = (id: number) => (open: boolean) => setEditing(open ? id : null);

  // Template rows in order, then any lines added by hand (matched across deals by label).
  const rows = useMemo(() => {
    const seen = new Map<string, { section: string; key: string; label: string }>();
    for (const it of [...items].sort((a, b) => a.sort - b.sort)) {
      if (it.section === CONTRACT_SECTION) continue;
      const key = it.item_key.startsWith('custom-') ? `${it.section}:${it.label.toLowerCase()}` : it.item_key;
      if (!seen.has(key)) seen.set(key, { section: it.section, key, label: it.label });
    }
    return CM_SECTIONS.filter(s => s !== CONTRACT_SECTION)
      .map(s => ({ section: s, rows: Array.from(seen.values()).filter(r => r.section === s) }));
  }, [items]);

  const cell = (dealId: number, key: string) =>
    items.find(i => i.deal_id === dealId && (i.item_key === key || (i.item_key.startsWith('custom-') && `${i.section}:${i.label.toLowerCase()}` === key)));

  const name = (id: number) => deals.find(d => d.id === id)?.name ?? '';
  const upcoming = items
    .filter(i => i.status !== 'done' && i.status !== 'na' && i.due_date && (daysUntil(i.due_date) ?? 999) <= UPCOMING_DAYS)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

  if (!deals.length) {
    return <p className="text-sm text-gray-400">No construction checklists yet. Start one from a deal&apos;s Diligence / CM tab.</p>;
  }

  return (
    <div>
      {upcoming.length > 0 && (
        <div className="mb-4 bg-white border border-gray-200 rounded-lg px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.12em] font-semibold text-gray-500 mb-2">Due in the next {UPCOMING_DAYS} days</p>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1">
            {upcoming.map(i => {
              const d = daysUntil(i.due_date);
              return (
                <li key={i.id} className="flex items-start gap-2 text-[11px]">
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium shrink-0 font-mono ${ddChipColor(d)}`}>
                    {d != null && d < 0 ? `${-d}d late` : i.due_date}
                  </span>
                  <span className="text-gray-500 shrink-0">{name(i.deal_id)}</span>
                  <span className="text-gray-800">{i.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto border border-gray-200 rounded-lg bg-white">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="border-b border-gray-200 align-top">
              <th className="sticky left-0 z-10 bg-white text-left px-3 py-3 min-w-[210px] font-medium text-gray-500">Item</th>
              {deals.map(d => {
                const live = items.filter(i => i.deal_id === d.id && i.status !== 'na');
                const done = live.filter(i => i.status === 'done').length;
                const sc = items.find(i => i.deal_id === d.id && i.item_key === 'cm_est_completion')?.due_date ?? null;
                const scDays = daysUntil(sc);
                return (
                  <th key={d.id} className={`${colW} text-left px-3 py-3 border-l border-gray-100 font-normal`}>
                    <button onClick={() => onOpenDeal(d.id)} className="text-sm font-semibold text-gray-900 hover:text-navy hover:underline text-left">{d.name}</button>
                    <p className="text-[11px] text-gray-500">{[d.city, d.state].filter(Boolean).join(', ')}</p>
                    {sc && (
                      <span className={`inline-block mt-1.5 text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ddChipColor(scDays)}`}>
                        Est. completion {sc}{scDays != null && scDays >= 0 ? ` · ${scDays}d` : ''}
                      </span>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1 font-mono">{done}/{live.length} done</p>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <Section title={CONTRACT_SECTION} span={deals.length}>
              <tr className="border-b border-gray-100 align-top">
                <td className="sticky left-0 z-10 bg-white px-3 py-2 text-gray-700">
                  Open items
                  <span className="block text-[10px] text-gray-400">from each construction contract</span>
                </td>
                {deals.map(d => {
                  const all = items.filter(i => i.deal_id === d.id && i.section === CONTRACT_SECTION);
                  const open = all
                    .filter(i => i.status === 'open' || i.status === 'in_progress')
                    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.sort - b.sort);
                  return (
                    <td key={d.id} className={`${colW} border-l border-gray-100 p-0`}>
                      <div className="divide-y divide-gray-100">
                        {open.map(it => (
                          <GridCell key={it.id} item={it} showLabel editing={editing === it.id} onEdit={edit(it.id)} onSave={onSave} />
                        ))}
                      </div>
                      {!open.length && <span className="block px-3 py-2 text-gray-300">—</span>}
                      {all.length > open.length && (
                        <button onClick={() => onOpenDeal(d.id)} className="block px-3 py-1.5 text-[10px] text-gray-400 hover:text-navy">
                          {all.length - open.length} done / N/A
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            </Section>

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
                            <GridCell item={it} editing={editing === it.id} onEdit={edit(it.id)} onSave={onSave} />
                          ) : <span className="block px-3 py-2 text-gray-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </Section>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
