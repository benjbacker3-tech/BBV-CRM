'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PersonalReminder, REMINDER_CATEGORIES, fmtDay, todayIso, usd } from '@/lib/personal';
import { daysUntil } from '@/lib/utils';

const EMPTY = { name: '', due_date: todayIso(), amount: '', category: 'Other', recurring: false, recur_months: 1, notes: '' };

// Upcoming bills and to-dos. Dismissing a recurring one schedules the next.
export default function Reminders() {
  const { slug } = useParams<{ slug: string }>();
  const [items, setItems] = useState<PersonalReminder[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const load = useCallback(async () => {
    const d = await fetch(`/api/personal/${slug}/reminders`).then(r => r.json());
    setItems(d.reminders);
  }, [slug]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!form.name || !form.due_date) return;
    await fetch(`/api/personal/${slug}/reminders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, amount: form.amount ? parseFloat(form.amount) : null, notes: form.notes || null }),
    });
    setForm({ ...EMPTY, due_date: todayIso() });
    setAdding(false);
    load();
  };
  const dismiss = async (id: string) => {
    await fetch(`/api/personal/reminders/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismiss' }) });
    load();
  };

  const urgency = (due: string) => {
    const d = daysUntil(due) ?? 0;
    if (d <= 7) return { box: 'border-red-200 bg-red-50/60', pill: 'pill-red', label: d < 0 ? `${-d}d overdue` : d === 0 ? 'Today' : `In ${d}d` };
    if (d <= 30) return { box: 'border-amber-200 bg-amber-50/60', pill: 'pill-amber', label: `In ${d}d` };
    return { box: 'border-slate-200 bg-white', pill: 'pill-green', label: `In ${d}d` };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Reminders</h1>
        <button onClick={() => setAdding(a => !a)} className="btn-primary">+ Add</button>
      </div>

      {adding && (
        <div className="card card-body space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><label className="field-label">Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="field" /></div>
            <div><label className="field-label">Due date</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="field" /></div>
            <div><label className="field-label">Amount</label><input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} className="field" /></div>
            <div><label className="field-label">Category</label>
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className="field">{REMINDER_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <input id="rec" type="checkbox" checked={form.recurring} onChange={e => setForm({ ...form, recurring: e.target.checked })} />
              <label htmlFor="rec">Recurring</label>
              {form.recurring && <>every <input type="number" min={1} value={form.recur_months} onChange={e => setForm({ ...form, recur_months: parseInt(e.target.value || '1') })} className="field !w-16" /> month(s)</>}
            </div>
            <div className="sm:col-span-2"><label className="field-label">Notes</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="field" /></div>
          </div>
          <div className="flex gap-2"><button onClick={add} className="btn-primary">Add reminder</button><button onClick={() => setAdding(false)} className="btn-ghost">Cancel</button></div>
        </div>
      )}

      {items === null ? <p className="text-xs text-slate-400">Loading…</p> : items.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No active reminders.</p> : (
        <div className="space-y-2">
          {items.map(r => {
            const u = urgency(r.due_date);
            return (
              <div key={r.id} className={`flex items-center gap-3 rounded-xl border p-3.5 ${u.box}`}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900">{r.name}{r.recurring ? <span className="ml-1.5 text-xs text-slate-400" title={`Repeats every ${r.recur_months || 1} month(s)`}>↻</span> : null}</p>
                  <p className="text-xs text-slate-500">{fmtDay(r.due_date)}{r.amount != null && <> · {usd(r.amount)}</>}{r.category !== 'Other' && <> · {r.category}</>}</p>
                  {r.notes && <p className="mt-0.5 text-xs text-slate-500">{r.notes}</p>}
                </div>
                <span className={`pill ${u.pill}`}>{u.label}</span>
                <button onClick={() => dismiss(r.id)} className="btn-ghost !px-2" title={r.recurring ? 'Done: the next one will be scheduled' : 'Dismiss'}>✕</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
