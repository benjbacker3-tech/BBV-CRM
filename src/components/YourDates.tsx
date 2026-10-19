'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { MyDate } from '@/lib/my-dates';
import { fmt, shortDate } from '@/lib/utils';

// "Your dates" on the Dashboard: Ben's own deadlines for the next 7 days, plus anything overdue
// (lib/my-dates.ts): contract deadlines, asset dates, personal reminders, checklist, follow-ups.
const KIND_LABEL: Record<MyDate['kind'], string> = { deal: 'Deal', checklist: 'Diligence', asset: 'Asset', personal: 'Personal', task: 'Follow-up' };
function dueTone(iso: string): 'over' | 'today' | 'soon' {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  const n = Math.round((new Date(iso + 'T00:00:00').getTime() - t.getTime()) / 86_400_000);
  return n < 0 ? 'over' : n === 0 ? 'today' : 'soon';
}

export default function YourDates({ className = '' }: { className?: string }) {
  const [dates, setDates] = useState<MyDate[] | null>(null);
  const [all, setAll] = useState(false);
  useEffect(() => {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    fetch(`/api/brief/dates?today=${today}`).then(r => (r.ok ? r.json() : null)).then(j => setDates(j?.dates ?? [])).catch(() => setDates([]));
  }, []);
  if (!dates) return null;
  const shown = all ? dates : dates.slice(0, 8);
  return (
    <div className={`card ${className}`}>
      <div className="card-header">
        <p className="card-title">Your dates · next 7 days</p>
        {dates.length > 0 && <span className="count">{dates.length}</span>}
      </div>
      {dates.length === 0 ? <p className="px-4 py-3 text-sm text-slate-500">Nothing due in the next 7 days.</p> : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {shown.map((d, i) => {
            const tone = dueTone(d.date);
            return (
              <li key={i}>
                <Link href={d.href} className="flex items-center gap-3 px-4 py-2 text-[13px] hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <span className={`pill w-[72px] shrink-0 justify-center font-mono ${tone === 'over' ? 'pill-red' : tone === 'today' ? 'pill-amber' : 'pill-slate'}`}>{tone === 'over' ? 'overdue' : tone === 'today' ? 'today' : shortDate(d.date)}</span>
                  <span className="w-[70px] shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-navy dark:text-blue-300">{KIND_LABEL[d.kind]}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-800 dark:text-slate-200"><b className="font-semibold">{d.where}</b> · {d.what}</span>
                  {d.amount ? <span className="font-mono text-xs text-slate-500">{fmt(d.amount)}</span> : null}
                </Link>
              </li>
            );
          })}
          {dates.length > 8 && (
            <li><button onClick={() => setAll(a => !a)} className="w-full px-4 py-2 text-left text-xs font-medium text-navy hover:bg-slate-50 dark:text-blue-300 dark:hover:bg-slate-800/50">{all ? 'Show fewer' : `Show ${dates.length - 8} more`}</button></li>
          )}
        </ul>
      )}
    </div>
  );
}
