'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { fmt, fmtNum, timeAgo } from '@/lib/utils';
import type { Lead } from '@/lib/leads';

type Row = Lead & { match_name: string | null; match_stage: string | null };
type Status = 'new' | 'kept' | 'dismissed';
const LABEL: Record<Status, string> = { new: 'New', kept: 'Added', dismissed: 'Dismissed' };
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Broker leads: offering emails found in the mailbox. Add one to the Pipeline (as a Tracking
// deal, with the parsed details to confirm) or dismiss it.
export default function LeadsPage() {
  const [status, setStatus] = useState<Status>('new');
  const [data, setData] = useState<{ leads: Row[]; counts: Record<string, number>; lastRun: { at: string } | null } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);

  const load = useCallback(async (s: Status) => setData(await fetch(`/api/leads?status=${s}`).then(r => r.json())), []);
  useEffect(() => { load(status); }, [load, status]);

  const scan = async () => {
    setScanning(true);
    setNote(null);
    try {
      const r = await fetch('/api/leads/scan', { method: 'POST' }).then(x => x.json());
      if (r.error) setNote(r.error);
      else if (r.busy) setNote('A scan is already running. Try again in a minute.');
      else setNote(`Checked ${r.checked} email${r.checked === 1 ? '' : 's'}: ${r.added} new lead${r.added === 1 ? '' : 's'}${r.repeats ? `, ${r.repeats} repeat${r.repeats === 1 ? '' : 's'} of listings already here` : ''}${r.more ? '. More to check; click again.' : '.'}`);
      await load(status);
    } finally {
      setScanning(false);
    }
  };
  const act = async (id: number, body: unknown) => { await fetch(`/api/leads/${id}`, json('PUT', body)); load(status); };

  const counts = data?.counts || {};
  return (
    <div className="page !max-w-[1100px]">
      <div className="page-header">
        <div>
          <p className="eyebrow">Sandpiper Capital LLC · Sourcing</p>
          <h1 className="page-title">Leads</h1>
          <p className="page-sub">Offering emails from brokers, found in your inbox each morning. Add the good ones to the Pipeline; dismiss the rest.</p>
        </div>
        <div className="text-right">
          <button onClick={scan} disabled={scanning} className="btn-primary">{scanning ? 'Checking email…' : 'Check email now'}</button>
          {data?.lastRun && <p className="mt-1 text-[10px] text-slate-400">Last checked {timeAgo(data.lastRun.at)}</p>}
        </div>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="segmented">
          {(['new', 'kept', 'dismissed'] as Status[]).map(s => (
            <button key={s} onClick={() => setStatus(s)} className={`segment ${status === s ? 'segment-active' : ''}`}>
              {LABEL[s]} <span className="ml-1 font-mono text-[10px] text-slate-400">{counts[s] || 0}</span>
            </button>
          ))}
        </div>
        {note && <p className="text-xs text-slate-600">{note}</p>}
      </div>

      {!data ? <p className="text-xs text-slate-400">Loading…</p> : data.leads.length === 0 ? (
        <div className="card px-6 py-10 text-center text-sm text-slate-400">
          {status === 'new' ? <>No new leads. <button onClick={scan} className="text-navy underline">Check email now</button></> : `Nothing ${LABEL[status].toLowerCase()} yet.`}
        </div>
      ) : (
        <div className="space-y-3">
          {data.leads.map(l => (
            <LeadCard key={l.id} l={l} adding={adding === l.id} onAdd={() => setAdding(l.id)} onCancel={() => setAdding(null)}
              onKeep={async fields => { await act(l.id, { action: 'keep', ...fields }); setAdding(null); }}
              onDismiss={() => act(l.id, { action: 'dismiss' })} onRestore={() => act(l.id, { action: 'restore' })} />
          ))}
        </div>
      )}
    </div>
  );
}

function LeadCard({ l, adding, onAdd, onCancel, onKeep, onDismiss, onRestore }: {
  l: Row; adding: boolean; onAdd: () => void; onCancel: () => void; onKeep: (f: Record<string, string>) => Promise<void>; onDismiss: () => void; onRestore: () => void;
}) {
  const files: string[] = (() => { try { return JSON.parse(l.attachments || '[]'); } catch { return []; } })();
  const chips = [
    l.address, [l.city, l.state].filter(Boolean).join(', ') || null,
    l.price ? fmt(l.price) : null, l.acres ? `${fmtNum(l.acres, 2)} ac` : null,
    l.sf ? `${fmtNum(l.sf, 0)} SF` : null, l.cap_rate ? `${l.cap_rate}% cap` : null,
  ].filter(Boolean) as string[];

  return (
    <div className="card">
      <div className="flex flex-wrap items-start gap-4 px-4 py-3.5">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-slate-500">
            {new Date(l.received_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · <b className="font-medium text-slate-700">{l.sender_name || l.sender_email}</b>{l.firm ? ` · ${l.firm}` : ''}
            {l.times_seen > 1 && <span className="ml-2 pill pill-slate" title="The same listing was emailed again">sent {l.times_seen}×</span>}
          </p>
          <p className="mt-0.5 text-sm font-semibold leading-snug text-slate-900">{l.subject || '(no subject)'}</p>
          {chips.length > 0
            ? <div className="mt-1.5 flex flex-wrap gap-1.5">{chips.map(c => <span key={c} className="pill pill-navy">{c}</span>)}</div>
            : <p className="mt-1 text-[11px] italic text-slate-400">No address or numbers found. Open the email for details.</p>}
          {l.match_deal_id && !l.deal_id && <p className="mt-1.5 text-[11px] text-amber-700">Already in the Pipeline as {l.match_name} ({l.match_stage}).</p>}
          {l.preview && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500">{l.preview}</p>}
          {files.length > 0 && <p className="mt-1 text-[11px] text-slate-400">📎 {files.slice(0, 4).join(' · ')}{files.length > 4 ? ` +${files.length - 4}` : ''}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {l.web_link && <a href={l.web_link} target="_blank" rel="noopener noreferrer" className="btn-secondary !py-1 !text-[11px]">Open email</a>}
          {l.status === 'new' && !adding && (
            <>
              <button onClick={onAdd} className="btn-primary !py-1 !text-[11px]">Add to Pipeline</button>
              <button onClick={onDismiss} className="btn-ghost !py-1 !text-[11px]">Dismiss</button>
            </>
          )}
          {l.status === 'kept' && <Link href="/properties" className="text-[11px] font-medium text-emerald-700 hover:underline">✓ Added{l.match_name ? `: ${l.match_name}` : ''} →</Link>}
          {l.status === 'dismissed' && <button onClick={onRestore} className="btn-ghost !py-1 !text-[11px]">Restore</button>}
        </div>
      </div>
      {adding && <KeepForm l={l} onCancel={onCancel} onKeep={onKeep} />}
    </div>
  );
}

// Confirm or fix what was parsed, then create the Tracking deal.
function KeepForm({ l, onCancel, onKeep }: { l: Row; onCancel: () => void; onKeep: (f: Record<string, string>) => Promise<void> }) {
  const [f, setF] = useState({
    address: l.address ?? '', city: l.city ?? '', state: l.state ?? '',
    price: l.price ? String(l.price) : '', acres: l.acres ? String(l.acres) : '', sf: l.sf ? String(l.sf) : '', cap_rate: l.cap_rate ? String(l.cap_rate) : '', notes: '',
  });
  const [busy, setBusy] = useState(false);
  const field = (k: keyof typeof f, label: string, cls = '') => (
    <div className={cls}><label className="field-label">{label}</label><input value={f[k]} onChange={e => setF({ ...f, [k]: e.target.value })} className="field" /></div>
  );
  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        {field('address', 'Address', 'col-span-2')}
        {field('city', 'City')}
        {field('state', 'State')}
        {field('price', 'Asking price')}
        {field('acres', 'Acres')}
        {field('sf', 'Building SF')}
        {field('cap_rate', 'Cap rate %')}
        {field('notes', 'Notes', 'col-span-2 sm:col-span-4')}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button disabled={busy} onClick={async () => { setBusy(true); await onKeep(f); setBusy(false); }} className="btn-primary">Add as Tracking deal</button>
        <button onClick={onCancel} className="btn-ghost">Cancel</button>
        <span className="text-[11px] text-slate-400">Broker and the email subject are saved on the deal. Run Napkin Math on it next.</span>
      </div>
    </div>
  );
}
