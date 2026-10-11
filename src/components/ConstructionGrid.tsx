'use client';

import { useMemo, useState } from 'react';
import { daysUntil, ddPill, shortDate } from '@/lib/utils';
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
    return <p className="card px-6 py-10 text-center text-sm text-slate-500">No construction checklists yet. Start one from a deal&apos;s Diligence / CM tab.</p>;
  }

  return (
    <div>
      {upcoming.length > 0 && (
        <div className="card mb-5 overflow-hidden">
          <div className="card-header">
            <p className="section-label">Due in the next {UPCOMING_DAYS} days</p>
            <span className="count">{upcoming.length}</span>
          </div>
          <ul className="grid grid-cols-2">
            {upcoming.map(i => {
              const d = daysUntil(i.due_date);
              return (
                <li key={i.id} className="flex items-start gap-3 px-4 py-2 text-[12px] border-b border-slate-100 dark:border-slate-800">
                  <span className={`${d != null && d < 0 ? 'pill pill-red' : ddPill(d)} shrink-0 w-16 justify-center font-mono`}>
                    {d != null && d < 0 ? `${-d}d late` : shortDate(i.due_date)}
                  </span>
                  <span className="pill pill-slate shrink-0">{name(i.deal_id)}</span>
                  <span className="text-slate-700 dark:text-slate-300 leading-snug">{i.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto w-fit max-w-full">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 align-top">
              <th className="sticky left-0 z-10 bg-white dark:bg-slate-900 text-left px-4 py-3.5 min-w-[220px] text-[10px] uppercase tracking-[0.08em] font-semibold text-slate-400">Item</th>
              {deals.map(d => {
                const live = items.filter(i => i.deal_id === d.id && i.status !== 'na');
                const done = live.filter(i => i.status === 'done').length;
                const sc = items.find(i => i.deal_id === d.id && i.item_key === 'cm_est_completion')?.due_date ?? null;
                const scDays = daysUntil(sc);
                return (
                  <th key={d.id} className={`${colW} text-left px-3 py-3.5 border-l border-slate-100 dark:border-slate-800 font-normal`}>
                    <button onClick={() => onOpenDeal(d.id)} className="text-sm font-semibold text-slate-900 dark:text-slate-100 hover:text-navy hover:underline text-left">{d.name}</button>
                    <p className="text-[11px] text-slate-500">{[d.city, d.state].filter(Boolean).join(', ')}</p>
                    {sc && (
                      <span className={`mt-2 ${ddPill(scDays)}`}>
                        Est. completion <span className="font-mono">{shortDate(sc)}</span>{scDays != null && scDays >= 0 ? ` · ${scDays}d` : ''}
                      </span>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="progress w-20"><span className="progress-bar" style={{ width: `${live.length ? Math.round((done / live.length) * 100) : 0}%` }} /></span>
                      <span className="text-[10px] text-slate-400 font-mono">{done}/{live.length}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            <Section title={CONTRACT_SECTION} span={deals.length}>
              <tr className="border-b border-slate-100 dark:border-slate-800 align-top">
                <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-2.5 text-slate-700 dark:text-slate-300">
                  Open items
                  <span className="block text-[10px] text-slate-400">from each construction contract</span>
                </td>
                {deals.map(d => {
                  const all = items.filter(i => i.deal_id === d.id && i.section === CONTRACT_SECTION);
                  const open = all
                    .filter(i => i.status === 'open' || i.status === 'in_progress')
                    .sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999') || a.sort - b.sort);
                  return (
                    <td key={d.id} className={`${colW} border-l border-slate-100 dark:border-slate-800 p-0`}>
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {open.map(it => (
                          <GridCell key={it.id} item={it} showLabel editing={editing === it.id} onEdit={edit(it.id)} onSave={onSave} />
                        ))}
                      </div>
                      {!open.length && <span className="block px-3 py-2.5 text-slate-300">—</span>}
                      {all.length > open.length && (
                        <button onClick={() => onOpenDeal(d.id)} className="block w-full text-left px-3 py-2 text-[10px] text-slate-400 hover:text-navy border-t border-slate-100 dark:border-slate-800">
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
                  <tr key={r.key} className="border-b border-slate-100 dark:border-slate-800 align-top">
                    <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-2.5 text-slate-700 dark:text-slate-300">{r.label}</td>
                    {deals.map(d => {
                      const it = cell(d.id, r.key);
                      return (
                        <td key={d.id} className={`${colW} border-l border-slate-100 dark:border-slate-800 p-0`}>
                          {it ? (
                            <GridCell item={it} editing={editing === it.id} onEdit={edit(it.id)} onSave={onSave} />
                          ) : <span className="block px-3 py-2.5 text-slate-300">—</span>}
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
