'use client';

import { useEffect, useState } from 'react';
import type { DealDate } from './rates-brief';
import type { DdItem } from './dd-template';

const WINDOW_DAYS = 21;

// Your upcoming dates from the CRM for the Daily Brief's "Week ahead": DD expiries and
// closings for deals under contract, and open construction items with a due date.
export function useDealDates(): DealDate[] {
  const [dates, setDates] = useState<DealDate[]>([]);
  useEffect(() => {
    let live = true;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const end = new Date(today); end.setDate(end.getDate() + WINDOW_DAYS);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const inWindow = (s: string | null | undefined) => !!s && s >= iso(today) && s <= iso(end);

    Promise.all([
      fetch('/api/deals').then(r => (r.ok ? r.json() : [])),
      fetch('/api/dd/overview').then(r => (r.ok ? r.json() : { construction: [] })),
    ]).then(([deals, dd]: [{ id: number; name: string; stage: string; dd_expiry: string | null; close_date: string | null }[], { construction?: DdItem[] }]) => {
      if (!live) return;
      const out: DealDate[] = [];
      const name = new Map(deals.map(d => [d.id, d.name]));
      for (const d of deals) {
        if (d.stage !== 'Under Contract' && d.stage !== 'Negotiating PSA') continue;
        if (inWindow(d.dd_expiry)) out.push({ d: d.dd_expiry as string, e: `${d.name}: due diligence expires`, tag: 'Your deals' });
        if (inWindow(d.close_date)) out.push({ d: d.close_date as string, e: `${d.name}: closing`, tag: 'Your deals' });
      }
      for (const i of dd.construction || []) {
        if (i.status === 'done' || i.status === 'na' || !inWindow(i.due_date)) continue;
        out.push({ d: i.due_date as string, e: `${name.get(i.deal_id) ?? 'Construction'}: ${i.label}`, tag: 'Construction' });
      }
      setDates(out);
    }).catch(() => { /* the brief still renders without them */ });
    return () => { live = false; };
  }, []);
  return dates;
}
