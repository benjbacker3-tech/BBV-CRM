'use client';

import { useEffect, useState, useCallback } from 'react';

interface Event {
  id: number;
  name: string;
  category: string | null;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  url: string | null;
  cost: string | null;
  notes: string | null;
}

const CATEGORIES = ['Mining', 'Shipping', 'Construction', 'Logistics', 'Industrial', 'Other'];

const categoryColor: Record<string, string> = {
  Mining: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Shipping: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  Construction: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
  Logistics: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300',
  Industrial: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  Other: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const fmtDateRange = (start: string | null, end: string | null): string => {
  if (!start) return '—';
  const fmt = (s: string) => new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  if (!end || end === start) return fmt(start);
  // Compact range: same year omits second year, same month omits second month
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  const sameYear = s.getFullYear() === e.getFullYear();
  const sameMonth = sameYear && s.getMonth() === e.getMonth();
  if (sameMonth) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}–${e.getDate()}, ${e.getFullYear()}`;
  }
  if (sameYear) {
    return `${s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${e.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${e.getFullYear()}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
};

const isPast = (e: Event) => {
  const ref = e.end_date || e.start_date;
  return !!ref && ref < new Date().toISOString().split('T')[0];
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const load = useCallback(() => {
    fetch('/api/events').then(r => r.json()).then(setEvents);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (id: number) => {
    if (!confirm('Delete this event?')) return;
    await fetch(`/api/events/${id}`, { method: 'DELETE' });
    load();
  };

  const startEdit = (e: Event) => { setEditingId(e.id); setShowForm(true); };
  const startAdd = () => { setEditingId(null); setShowForm(true); };

  if (events === null) {
    return (
      <div className="p-8">
        <div className="skeleton h-7 w-40 mb-5" />
        <div className="space-y-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-14 w-full" />)}</div>
      </div>
    );
  }

  const filtered = filter === 'all' ? events : events.filter(e => e.category === filter);
  const upcoming = filtered.filter(e => !isPast(e));
  const past = filtered.filter(isPast);

  const editingEvent = editingId ? events.find(e => e.id === editingId) || null : null;

  return (
    <div className="px-8 py-8 max-w-[1300px]">
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 mb-1">MCI · IOS Tenant Industry Calendar</p>
          <h1 className="text-xl font-medium text-gray-900 dark:text-gray-100 tracking-tight">Events</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={filter} onChange={e => setFilter(e.target.value)}
            className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded dark:bg-surface-dark dark:text-gray-200">
            <option value="all">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button onClick={startAdd} className="px-3 py-1.5 text-xs text-white bg-amber hover:bg-amber-dark rounded">
            + Add Event
          </button>
        </div>
      </div>

      {upcoming.length > 0 && (
        <Section title="Upcoming">
          {upcoming.map(e => <EventRow key={e.id} event={e} onEdit={() => startEdit(e)} onDelete={() => remove(e.id)} />)}
        </Section>
      )}

      {past.length > 0 && (
        <Section title="Past" muted>
          {past.map(e => <EventRow key={e.id} event={e} onEdit={() => startEdit(e)} onDelete={() => remove(e.id)} muted />)}
        </Section>
      )}

      {events.length === 0 && (
        <div className="text-center py-16 text-sm text-gray-400 dark:text-gray-500">
          No events yet. Click <span className="font-medium text-gray-600 dark:text-gray-300">+ Add Event</span> to track an industry expo, conference, or trade show.
        </div>
      )}

      {showForm && (
        <EventModal
          event={editingEvent}
          onClose={() => { setShowForm(false); setEditingId(null); }}
          onSaved={() => { setShowForm(false); setEditingId(null); load(); }}
        />
      )}
    </div>
  );
}

function Section({ title, children, muted }: { title: string; children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="mb-8">
      <h2 className={`text-[10px] uppercase tracking-[0.15em] font-semibold mb-2 pb-1 border-b border-gray-200 dark:border-gray-700 ${muted ? 'text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-200'}`}>
        {title}
      </h2>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">{children}</div>
    </div>
  );
}

function EventRow({ event, onEdit, onDelete, muted }: { event: Event; onEdit: () => void; onDelete: () => void; muted?: boolean }) {
  return (
    <div className={`py-3 grid grid-cols-12 gap-3 items-start group hover:bg-gray-50/60 dark:hover:bg-gray-800/30 px-2 -mx-2 rounded transition-colors ${muted ? 'opacity-70' : ''}`}>
      <div className="col-span-2 text-xs font-mono tabular-nums text-gray-700 dark:text-gray-300 pt-0.5">
        {fmtDateRange(event.start_date, event.end_date)}
      </div>
      <div className="col-span-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{event.name}</span>
          {event.category && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${categoryColor[event.category] || categoryColor.Other}`}>{event.category}</span>
          )}
        </div>
        {event.location && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{event.location}</p>}
      </div>
      <div className="col-span-2 text-xs text-gray-500 dark:text-gray-400 pt-0.5">{event.cost || '—'}</div>
      <div className="col-span-3 text-xs pt-0.5">
        {event.url ? (
          <a href={event.url} target="_blank" rel="noreferrer" className="text-amber hover:text-amber-dark truncate block" title={event.url}>
            {event.url.replace(/^https?:\/\//, '').split('/')[0]}
          </a>
        ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
        {event.notes && <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{event.notes}</p>}
      </div>
      <div className="col-span-1 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onEdit} title="Edit" className="p-1 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
        </button>
        <button onClick={onDelete} title="Delete" className="p-1 text-gray-400 hover:text-red-600">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M11 7V4a2 2 0 114 0v3" /></svg>
        </button>
      </div>
    </div>
  );
}

function EventModal({ event, onClose, onSaved }: { event: Event | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: event?.name || '',
    category: event?.category || 'Industrial',
    start_date: event?.start_date || '',
    end_date: event?.end_date || '',
    location: event?.location || '',
    url: event?.url || '',
    cost: event?.cost || '',
    notes: event?.notes || '',
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const submit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const url = event ? `/api/events/${event.id}` : '/api/events';
      const method = event ? 'PUT' : 'POST';
      await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, end_date: form.end_date || form.start_date || null }),
      });
      onSaved();
    } finally { setSaving(false); }
  };

  const inputCls = "w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200";

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative bg-white dark:bg-surface rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100 mb-4">{event ? 'Edit Event' : 'New Event'}</h2>
        <div className="space-y-3">
          <Field label="Name *">
            <input autoFocus value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. CONEXPO-CON/AGG 2026" className={inputCls} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category">
              <select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })} className={inputCls}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Cost">
              <input value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} placeholder="$1,295 / Free" className={inputCls} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start Date">
              <input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className={inputCls} />
            </Field>
            <Field label="End Date">
              <input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className={inputCls} />
            </Field>
          </div>
          <Field label="Location">
            <input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="Las Vegas, NV" className={inputCls} />
          </Field>
          <Field label="Sign-up URL">
            <input value={form.url} onChange={e => setForm({ ...form, url: e.target.value })} placeholder="https://..." className={inputCls} />
          </Field>
          <Field label="Notes">
            <textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800">Cancel</button>
          <button onClick={submit} disabled={saving || !form.name.trim()} className="px-3 py-1.5 text-xs bg-amber text-white rounded hover:bg-amber-dark disabled:opacity-50">
            {saving ? 'Saving…' : event ? 'Save' : 'Add Event'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}
