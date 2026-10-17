'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Deal, fmt, fmtNum, googleEarthUrl, shortDate } from '@/lib/utils';
import { ASSET_CATEGORIES, AssetItem, TONE_PILL, dateStatus } from '@/lib/asset-bulletin';

const REPEATS: [string, number | null][] = [['One-time', null], ['Monthly', 1], ['Quarterly', 3], ['Every 6 months', 6], ['Yearly', 12]];
const repeatLabel = (m: number | null) => REPEATS.find(r => r[1] === m)?.[0] ?? `Every ${m} months`;
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// created_at is stored in UTC (SQLite datetime('now')); show it as the local calendar day.
const localDay = (utc: string) => { const d = new Date(utc.replace(' ', 'T') + 'Z'); return isNaN(d.getTime()) ? utc.slice(0, 10) : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Asset bulletin: the key dates to see coming (lease, insurance, tax, loan) and running notes.
export default function AssetPage() {
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [items, setItems] = useState<AssetItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, i] = await Promise.all([
      fetch(`/api/deals/${id}`).then(r => (r.ok ? r.json() : null)),
      fetch(`/api/assets/items?deal_id=${id}`).then(r => r.json()),
    ]);
    if (!d) setError('Asset not found.');
    setDeal(d);
    setItems(i.items || []);
  }, [id]);
  useEffect(() => { load(); }, [load]);

  if (error) return <div className="page"><p className="page-sub">{error} <Link href="/assets" className="text-navy underline">Back to Assets</Link></p></div>;
  if (!deal || !items) return <div className="page"><p className="text-xs text-slate-400">Loading…</p></div>;

  const dates = items.filter(i => i.kind === 'date');
  const notes = items.filter(i => i.kind === 'note').sort((a, b) => b.pinned - a.pinned || b.created_at.localeCompare(a.created_at));
  const earth = googleEarthUrl(deal);
  const own = deal.ownership_pct ?? 100;

  return (
    <div className="page !max-w-[1200px]">
      <div className="page-header !items-start">
        <div>
          <p className="eyebrow"><Link href="/assets" className="hover:text-navy">Assets</Link> · {deal.stage}</p>
          <h1 className="page-title">{deal.address || deal.name}</h1>
          <p className="page-sub">{[deal.city, deal.state].filter(Boolean).join(', ')}{deal.notes ? ` · ${deal.notes}` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {own < 100 && <span className="pill pill-navy">{own}% owned</span>}
          {earth && <a href={earth} target="_blank" rel="noopener noreferrer" className="btn-secondary">Google Earth</a>}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="stat"><p className="stat-label">Building SF</p><p className="stat-value">{deal.sf ? fmtNum(deal.sf, 0) : '—'}</p></div>
        <div className="stat"><p className="stat-label">Acres</p><p className="stat-value">{deal.acreage ? fmtNum(deal.acreage, 2) : '—'}</p></div>
        <div className="stat"><p className="stat-label">Price{own < 100 ? ' (100%)' : ''}</p><p className="stat-value">{deal.asking_price ? fmt(deal.asking_price) : '—'}</p></div>
        <div className="stat"><p className="stat-label">Closed</p><p className="stat-value">{deal.close_date ? shortDate(deal.close_date) : '—'}</p></div>
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
        <KeyDates dealId={deal.id} dates={dates} reload={load} />
        <Notes dealId={deal.id} notes={notes} reload={load} />
      </div>
    </div>
  );
}

function KeyDates({ dealId, dates, reload }: { dealId: number; dates: AssetItem[]; reload: () => void }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [showDone, setShowDone] = useState(false);
  const open = dates.filter(d => !d.done_at);
  const done = dates.filter(d => d.done_at);
  const set = open.filter(d => d.due_date).sort((a, b) => a.due_date!.localeCompare(b.due_date!));
  const unset = open.filter(d => !d.due_date);

  const act = async (id: number, body: unknown) => { await fetch(`/api/assets/items/${id}`, json('PUT', body)); reload(); };
  const del = async (id: number) => { if (confirm('Delete this date?')) { await fetch(`/api/assets/items/${id}`, { method: 'DELETE' }); reload(); } };
  const standard = async () => { await fetch('/api/assets/items', json('POST', { deal_id: dealId, standard: true })); reload(); };

  const row = (d: AssetItem) => {
    const s = dateStatus(d);
    if (editing === d.id) return <DateForm key={d.id} dealId={dealId} item={d} onDone={() => { setEditing(null); reload(); }} />;
    return (
      <li key={d.id} className="group flex items-start gap-3 px-4 py-2.5">
        <span className={`pill ${TONE_PILL[s.tone]} mt-0.5 w-[72px] shrink-0 justify-center`}>{s.label}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-slate-900">{d.title} <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{d.category}</span></p>
          <p className="text-[11px] text-slate-500">
            {d.due_date ? shortDate(d.due_date) : 'No date yet'}
            {d.recur_months ? ` · ${repeatLabel(d.recur_months)}` : ''}
            {d.last_done ? ` · last done ${shortDate(d.last_done)}` : ''}
          </p>
          {d.body && <p className="mt-0.5 text-[11px] text-slate-500">{d.body}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1 opacity-60 group-hover:opacity-100">
          {d.due_date && <button onClick={() => act(d.id, { action: 'done', today: localToday() })} className="btn-secondary !px-2 !py-0.5 !text-[11px]" title={d.recur_months ? 'Done: moves to the next date' : 'Done'}>✓ Done</button>}
          <button onClick={() => setEditing(d.id)} className="btn-ghost !px-2 !py-0.5 !text-[11px]">{d.due_date ? 'Edit' : 'Set date'}</button>
          <button onClick={() => del(d.id)} className="btn-ghost !px-1.5 !py-0.5 !text-[11px] text-slate-400" title="Delete">✕</button>
        </div>
      </li>
    );
  };

  return (
    <section className="card">
      <div className="card-header">
        <p className="card-title">Key dates <span className="count ml-1">{open.length}</span></p>
        <div className="flex gap-1.5">
          <button onClick={standard} className="btn-ghost !text-[11px]" title="Adds lease, insurance, tax, loan and entity dates this asset doesn't have yet (no dates filled in)">+ Standard dates</button>
          <button onClick={() => setAdding(a => !a)} className="btn-primary !text-[11px]">+ Add date</button>
        </div>
      </div>
      {adding && <DateForm dealId={dealId} onDone={() => { setAdding(false); reload(); }} />}
      {open.length === 0 && !adding ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">No dates yet. Add lease, insurance and tax dates with <b>+ Standard dates</b>, then fill them in.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {set.map(row)}
          {unset.length > 0 && <li className="bg-slate-50 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Date not set</li>}
          {unset.map(row)}
        </ul>
      )}
      {done.length > 0 && (
        <div className="border-t border-slate-100 px-4 py-2">
          <button onClick={() => setShowDone(s => !s)} className="text-[11px] text-slate-500 hover:text-slate-800">{showDone ? 'Hide' : 'Show'} completed ({done.length})</button>
          {showDone && (
            <ul className="mt-1 space-y-1">
              {done.map(d => (
                <li key={d.id} className="flex items-center gap-2 text-[11px] text-slate-400">
                  <span className="line-through">{d.title}{d.due_date ? ` · ${shortDate(d.due_date)}` : ''}</span>
                  <button onClick={() => act(d.id, { action: 'reopen' })} className="underline hover:text-slate-700">reopen</button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

function DateForm({ dealId, item, onDone }: { dealId: number; item?: AssetItem; onDone: () => void }) {
  const [f, setF] = useState({
    title: item?.title ?? '', category: item?.category ?? 'Lease', due_date: item?.due_date ?? '',
    recur_months: item?.recur_months ?? null as number | null, lead_days: item?.lead_days ?? 60, body: item?.body ?? '',
  });
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    if (!f.title.trim()) { setErr('Add a title.'); return; }
    const res = item
      ? await fetch(`/api/assets/items/${item.id}`, json('PUT', { ...f, due_date: f.due_date || null }))
      : await fetch('/api/assets/items', json('POST', { ...f, deal_id: dealId, kind: 'date', due_date: f.due_date || null }));
    if (!res.ok) { setErr((await res.json()).error || 'Could not save'); return; }
    onDone();
  };
  return (
    <div className="space-y-2 border-y border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div className="col-span-2"><label className="field-label">What</label><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} className="field" placeholder="e.g. Property insurance renewal" autoFocus /></div>
        <div><label className="field-label">Category</label><select value={f.category} onChange={e => setF({ ...f, category: e.target.value })} className="field">{ASSET_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
        <div><label className="field-label">Date</label><input type="date" value={f.due_date} onChange={e => setF({ ...f, due_date: e.target.value })} className="field" /></div>
        <div><label className="field-label">Repeats</label>
          <select value={f.recur_months ?? ''} onChange={e => setF({ ...f, recur_months: e.target.value ? Number(e.target.value) : null })} className="field">
            {REPEATS.map(([l, m]) => <option key={l} value={m ?? ''}>{l}</option>)}
          </select>
        </div>
        <div><label className="field-label">Flag (days ahead)</label><input type="number" min={0} value={f.lead_days} onChange={e => setF({ ...f, lead_days: Number(e.target.value) })} className="field" /></div>
        <div className="col-span-2"><label className="field-label">Details</label><input value={f.body} onChange={e => setF({ ...f, body: e.target.value })} className="field" placeholder="Notice period, carrier, amount…" /></div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} className="btn-primary">{item ? 'Save' : 'Add date'}</button>
        <button onClick={onDone} className="btn-ghost">Cancel</button>
        {err && <span className="text-xs text-red-600">{err}</span>}
      </div>
    </div>
  );
}

function Notes({ dealId, notes, reload }: { dealId: number; notes: AssetItem[]; reload: () => void }) {
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('Property');
  const post = async () => {
    if (!body.trim()) return;
    await fetch('/api/assets/items', json('POST', { deal_id: dealId, kind: 'note', body, category }));
    setBody('');
    reload();
  };
  const act = async (id: number, b: unknown) => { await fetch(`/api/assets/items/${id}`, json('PUT', b)); reload(); };
  const del = async (id: number) => { if (confirm('Delete this note?')) { await fetch(`/api/assets/items/${id}`, { method: 'DELETE' }); reload(); } };

  return (
    <section className="card">
      <div className="card-header"><p className="card-title">Notes <span className="count ml-1">{notes.length}</span></p></div>
      <div className="space-y-2 border-b border-slate-100 px-4 py-3">
        <textarea value={body} onChange={e => setBody(e.target.value)} rows={3} className="field !text-[13px]" placeholder="Tenant updates, PM notes, insurance claims, capex plans…"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) post(); }} />
        <div className="flex items-center gap-2">
          <select value={category} onChange={e => setCategory(e.target.value)} className="field !w-auto">{ASSET_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select>
          <button onClick={post} className="btn-primary ml-auto" disabled={!body.trim()}>Post note</button>
        </div>
      </div>
      {notes.length === 0 ? <p className="px-4 py-6 text-center text-sm text-slate-400">No notes yet.</p> : (
        <ul className="divide-y divide-slate-100">
          {notes.map(n => (
            <li key={n.id} className={`group px-4 py-3 ${n.pinned ? 'bg-amber-50/50' : ''}`}>
              <div className="mb-1 flex items-center gap-2 text-[10px] text-slate-400">
                <span className="font-semibold uppercase tracking-wider">{n.category}</span>
                <span>{shortDate(localDay(n.created_at))}</span>
                {n.pinned ? <span className="text-amber-700">Pinned</span> : null}
                <span className="ml-auto flex gap-2 opacity-0 group-hover:opacity-100">
                  <button onClick={() => act(n.id, { pinned: !n.pinned })} className="hover:text-slate-700">{n.pinned ? 'Unpin' : 'Pin'}</button>
                  <button onClick={() => del(n.id)} className="hover:text-red-600">Delete</button>
                </span>
              </div>
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-700">{n.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
