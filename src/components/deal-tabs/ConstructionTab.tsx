'use client';

import { useEffect, useState } from 'react';
import { Deal, daysUntil, ddPill, shortDate } from '@/lib/utils';
import { CM_SECTIONS, DdItem } from '@/lib/dd-template';
import { ChecklistSection, Progress } from './DiligenceTab';

const UPCOMING_DAYS = 21;

// Construction Oversight Checklist (workbook "Construction Mgmt" sheet), plus
// contract-specific lines under "Contract Items".
export default function ConstructionTab({ deal }: { deal: Deal }) {
  const [items, setItems] = useState<DdItem[] | null>(null);

  const load = () =>
    fetch(`/api/dd?deal_id=${deal.id}&list=cm`).then(r => r.json()).then(data => setItems(data.items || []));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [deal.id]);

  if (items === null) return <p className="text-xs text-slate-400 py-8 text-center">Loading…</p>;

  if (!items.length) {
    const start = async () => {
      await fetch('/api/dd', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deal_id: deal.id, start: 'cm' }) });
      load();
    };
    return (
      <div className="card text-center py-8 px-6 space-y-3">
        <p className="text-sm text-slate-500 dark:text-slate-400">No construction checklist for this deal yet.</p>
        <button onClick={start} className="btn-primary">Start construction checklist</button>
      </div>
    );
  }

  const saveItem = async (id: number, patch: Partial<DdItem>) => {
    setItems(prev => (prev || []).map(i => (i.id === id ? { ...i, ...patch } : i)));
    await fetch(`/api/dd/items/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
  };

  const live = items.filter(i => i.status !== 'na');
  const done = live.filter(i => i.status === 'done').length;
  const upcoming = live
    .filter(i => i.status !== 'done' && i.due_date && (daysUntil(i.due_date) ?? 999) <= UPCOMING_DAYS)
    .sort((a, b) => (a.due_date || '').localeCompare(b.due_date || ''));

  return (
    <div>
      <div className="card p-3.5 mb-4">
        <Progress label="Construction checklist" done={done} total={live.length} pct={live.length ? Math.round((done / live.length) * 100) : 0} />
      </div>

      {upcoming.length > 0 && (
        <div className="card mb-5 overflow-hidden">
          <div className="card-header !py-2.5">
            <p className="section-label">Due in the next {UPCOMING_DAYS} days</p>
            <span className="count">{upcoming.length}</span>
          </div>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {upcoming.map(i => {
              const d = daysUntil(i.due_date);
              return (
                <li key={i.id} className="flex items-start gap-3 px-3 py-2 text-[12px]">
                  <span className={`${d != null && d < 0 ? 'pill pill-red' : ddPill(d)} shrink-0 w-16 justify-center font-mono`}>
                    {d != null && d < 0 ? `${-d}d late` : shortDate(i.due_date)}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300 leading-snug">{i.label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="space-y-5">
        {CM_SECTIONS.map(section => (
          <ChecklistSection
            key={section}
            section={section}
            dealId={deal.id}
            rows={items.filter(i => i.section === section)}
            legacy={[]}
            onSave={saveItem}
            onChanged={load}
          />
        ))}
      </div>
    </div>
  );
}
