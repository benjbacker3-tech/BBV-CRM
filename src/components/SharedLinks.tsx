'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';

// List of share links with status, access counts, activity and revoke. Used on the
// Shared links page (all links) and in a deal's Documents tab (that deal's links).

export interface ShareRow {
  id: number;
  token: string;
  mode: 'view' | 'upload' | 'both';
  item_name: string;
  item_path: string | null;
  is_folder: number;
  deal_name: string | null;
  recipient: string;
  recipient_email: string | null;
  has_password: number;
  expires_at: string | null;
  notify: number;
  revoked_at: string | null;
  last_access_at: string | null;
  created_at: string;
  opens: number;
  downloads: number;
  uploads: number;
}

interface Event { kind: string; detail: string | null; ip: string | null; created_at: string }

const MODE: Record<ShareRow['mode'], string> = { view: 'View', upload: 'Upload', both: 'View + upload' };
// SQLite datetime('now') is UTC without a zone marker.
const asDate = (s: string) => new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s.replace(' ', 'T')}Z`);
const day = (s: string) => asDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
const when = (s: string) => asDate(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export function shareStatus(s: ShareRow): { label: string; cls: string; active: boolean } {
  if (s.revoked_at) return { label: 'Revoked', cls: 'pill-muted', active: false };
  if (s.expires_at && asDate(s.expires_at).getTime() < Date.now()) return { label: 'Expired', cls: 'pill-slate', active: false };
  return { label: 'Active', cls: 'pill-green', active: true };
}

export default function SharedLinks({ dealId, refreshKey = 0, compact = false }: { dealId?: number; refreshKey?: number; compact?: boolean }) {
  const [rows, setRows] = useState<ShareRow[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(dealId ? `/api/shares?dealId=${dealId}` : '/api/shares');
    const json = await res.json();
    setRows(json.shares || []);
  }, [dealId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  const toggle = async (id: number) => {
    if (open === id) { setOpen(null); return; }
    setOpen(id); setEvents(null);
    const res = await fetch(`/api/shares/${id}`);
    setEvents((await res.json()).events || []);
  };

  const patch = async (id: number, body: Record<string, unknown>) => {
    await fetch(`/api/shares/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    load();
  };

  const copy = async (s: ShareRow) => {
    await navigator.clipboard.writeText(`${window.location.origin}/s/${s.token}`).catch(() => null);
    setCopied(s.id);
    setTimeout(() => setCopied(null), 2000);
  };

  if (!rows) return <div className="skeleton h-16 w-full" />;
  const visible = rows.filter(r => showInactive || shareStatus(r).active);
  const inactive = rows.length - rows.filter(r => shareStatus(r).active).length;

  return (
    <div>
      {visible.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{rows.length ? 'No active links.' : 'No share links yet.'}</p>
      ) : (
        <div className="card overflow-x-auto">
          <table className="table-clean">
            <thead>
              <tr>
                <th>Shared</th>
                <th>With</th>
                {!compact && <th>Access</th>}
                <th>Expires</th>
                <th className="!text-right" title="Opens / downloads / uploads">Activity</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map(s => {
                const st = shareStatus(s);
                return (
                  <Fragment key={s.id}>
                    <tr className={`row ${st.active ? '' : 'opacity-60'}`}>
                      <td className="max-w-[280px]">
                        <div className="truncate text-slate-900 dark:text-slate-100 font-medium" title={s.item_path || s.item_name}>{s.item_name}{s.is_folder ? '/' : ''}</div>
                        {!compact && s.item_path && <div className="truncate text-[10px] text-slate-400 dark:text-slate-500" title={s.item_path}>{s.item_path}</div>}
                      </td>
                      <td>
                        <div className="text-slate-900 dark:text-slate-100">{s.recipient}</div>
                        {s.recipient_email && <div className="text-[10px] text-slate-400 dark:text-slate-500">{s.recipient_email}</div>}
                      </td>
                      {!compact && <td>{MODE[s.mode]}{s.has_password ? ' · password' : ''}</td>}
                      <td className="whitespace-nowrap">
                        <span className={`pill mr-1.5 ${st.cls}`}>{st.label}</span>
                        <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">{s.expires_at ? day(s.expires_at) : 'never'}</span>
                      </td>
                      <td className="num whitespace-nowrap">
                        <button onClick={() => toggle(s.id)} className="text-slate-700 dark:text-slate-300 hover:text-navy dark:hover:text-blue-300 hover:underline font-mono tabular-nums" title="Opens / downloads / uploads — click for the log">
                          {s.opens} / {s.downloads} / {s.uploads}
                        </button>
                        {s.last_access_at && <div className="text-[10px] font-sans text-slate-400 dark:text-slate-500">last {when(s.last_access_at)}</div>}
                      </td>
                      <td className="text-right whitespace-nowrap space-x-2">
                        {st.active && <button onClick={() => copy(s)} className="font-medium text-navy dark:text-blue-300 hover:underline">{copied === s.id ? 'Copied' : 'Copy link'}</button>}
                        {st.active && <button onClick={() => { if (confirm(`Turn off the link for ${s.recipient}? It stops working immediately.`)) patch(s.id, { action: 'revoke' }); }} className="font-medium text-red-600 dark:text-red-400 hover:underline">Revoke</button>}
                        {!st.active && s.revoked_at && <button onClick={() => patch(s.id, { action: 'restore' })} className="font-medium text-navy dark:text-blue-300 hover:underline">Restore</button>}
                        {!st.active && !s.revoked_at && <button onClick={() => patch(s.id, { expiresDays: 30 })} className="font-medium text-navy dark:text-blue-300 hover:underline">Extend 30 days</button>}
                      </td>
                    </tr>
                    {open === s.id && (
                      <tr>
                        <td colSpan={compact ? 5 : 6} className="!bg-slate-50 dark:!bg-slate-800/50">
                          {!events ? <p className="text-[11px] text-slate-500 dark:text-slate-400">Loading…</p> : events.length === 0 ? <p className="text-[11px] text-slate-500 dark:text-slate-400">Not opened yet.</p> : (
                            <ul className="space-y-0.5 text-[11px] max-h-48 overflow-y-auto">
                              {events.map((e, i) => (
                                <li key={i} className="flex gap-3">
                                  <span className="text-slate-400 dark:text-slate-500 font-mono tabular-nums w-28 shrink-0">{when(e.created_at)}</span>
                                  <span className={`w-20 shrink-0 ${e.kind === 'bad_password' ? 'text-red-600 dark:text-red-400' : e.kind === 'upload' ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-300'}`}>{e.kind === 'bad_password' ? 'wrong password' : e.kind === 'upload_start' ? 'upload started' : e.kind}</span>
                                  <span className="text-slate-800 dark:text-slate-200 truncate">{e.detail}</span>
                                  {e.ip && <span className="ml-auto text-slate-400 dark:text-slate-500 font-mono">{e.ip}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="mt-2 flex gap-3 text-[11px]">
                            <button onClick={() => patch(s.id, { notify: !s.notify })} className="font-medium text-navy dark:text-blue-300 hover:underline">{s.notify ? 'Stop emailing me about this link' : 'Email me about this link'}</button>
                            {st.active && <button onClick={() => patch(s.id, { expiresDays: 30 })} className="font-medium text-navy dark:text-blue-300 hover:underline">Expire 30 days from now</button>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {inactive > 0 && (
        <button onClick={() => setShowInactive(!showInactive)} className="mt-2 text-[11px] text-slate-500 dark:text-slate-400 hover:text-navy dark:hover:text-blue-300">
          {showInactive ? 'Hide' : 'Show'} {inactive} expired or revoked
        </button>
      )}
    </div>
  );
}
