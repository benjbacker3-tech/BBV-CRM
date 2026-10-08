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
  if (s.revoked_at) return { label: 'Revoked', cls: 'bg-gray-100 text-gray-500', active: false };
  if (s.expires_at && asDate(s.expires_at).getTime() < Date.now()) return { label: 'Expired', cls: 'bg-gray-100 text-gray-500', active: false };
  return { label: 'Active', cls: 'bg-emerald-50 text-emerald-700', active: true };
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
        <p className="text-xs text-gray-500">{rows.length ? 'No active links.' : 'No share links yet.'}</p>
      ) : (
        <div className="border border-gray-300 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-navy text-white text-[10px] uppercase tracking-[0.06em]">
                <th className="text-left font-semibold px-3 py-1.5">Shared</th>
                <th className="text-left font-semibold px-3 py-1.5">With</th>
                {!compact && <th className="text-left font-semibold px-3 py-1.5">Access</th>}
                <th className="text-left font-semibold px-3 py-1.5">Expires</th>
                <th className="text-right font-semibold px-3 py-1.5" title="Opens / downloads / uploads">Activity</th>
                <th className="px-3 py-1.5" />
              </tr>
            </thead>
            <tbody>
              {visible.map(s => {
                const st = shareStatus(s);
                return (
                  <Fragment key={s.id}>
                    <tr className={`border-b border-gray-200 ${st.active ? '' : 'opacity-60'}`}>
                      <td className="px-3 py-1.5 max-w-[280px]">
                        <div className="truncate text-gray-900 font-medium" title={s.item_path || s.item_name}>{s.item_name}{s.is_folder ? '/' : ''}</div>
                        {!compact && s.item_path && <div className="truncate text-[10px] text-gray-400" title={s.item_path}>{s.item_path}</div>}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="text-gray-900">{s.recipient}</div>
                        {s.recipient_email && <div className="text-[10px] text-gray-400">{s.recipient_email}</div>}
                      </td>
                      {!compact && <td className="px-3 py-1.5 text-gray-700">{MODE[s.mode]}{s.has_password ? ' · password' : ''}</td>}
                      <td className="px-3 py-1.5 whitespace-nowrap">
                        <span className={`text-[10px] font-semibold rounded px-1.5 py-0.5 mr-1.5 ${st.cls}`}>{st.label}</span>
                        <span className="text-gray-500">{s.expires_at ? day(s.expires_at) : 'never'}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap">
                        <button onClick={() => toggle(s.id)} className="text-gray-700 hover:text-navy hover:underline font-mono" title="Opens / downloads / uploads — click for the log">
                          {s.opens} / {s.downloads} / {s.uploads}
                        </button>
                        {s.last_access_at && <div className="text-[10px] text-gray-400">last {when(s.last_access_at)}</div>}
                      </td>
                      <td className="px-3 py-1.5 text-right whitespace-nowrap space-x-2">
                        {st.active && <button onClick={() => copy(s)} className="text-navy hover:underline">{copied === s.id ? 'Copied' : 'Copy link'}</button>}
                        {st.active && <button onClick={() => { if (confirm(`Turn off the link for ${s.recipient}? It stops working immediately.`)) patch(s.id, { action: 'revoke' }); }} className="text-red-600 hover:underline">Revoke</button>}
                        {!st.active && s.revoked_at && <button onClick={() => patch(s.id, { action: 'restore' })} className="text-navy hover:underline">Restore</button>}
                        {!st.active && !s.revoked_at && <button onClick={() => patch(s.id, { expiresDays: 30 })} className="text-navy hover:underline">Extend 30 days</button>}
                      </td>
                    </tr>
                    {open === s.id && (
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <td colSpan={compact ? 5 : 6} className="px-3 py-2">
                          {!events ? <p className="text-[11px] text-gray-500">Loading…</p> : events.length === 0 ? <p className="text-[11px] text-gray-500">Not opened yet.</p> : (
                            <ul className="space-y-0.5 text-[11px] max-h-48 overflow-y-auto">
                              {events.map((e, i) => (
                                <li key={i} className="flex gap-3">
                                  <span className="text-gray-400 w-28 shrink-0">{when(e.created_at)}</span>
                                  <span className={`w-20 shrink-0 ${e.kind === 'bad_password' ? 'text-red-600' : e.kind === 'upload' ? 'text-emerald-700' : 'text-gray-700'}`}>{e.kind === 'bad_password' ? 'wrong password' : e.kind === 'upload_start' ? 'upload started' : e.kind}</span>
                                  <span className="text-gray-800 truncate">{e.detail}</span>
                                  {e.ip && <span className="ml-auto text-gray-400 font-mono">{e.ip}</span>}
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="mt-2 flex gap-3 text-[11px]">
                            <button onClick={() => patch(s.id, { notify: !s.notify })} className="text-navy hover:underline">{s.notify ? 'Stop emailing me about this link' : 'Email me about this link'}</button>
                            {st.active && <button onClick={() => patch(s.id, { expiresDays: 30 })} className="text-navy hover:underline">Expire 30 days from now</button>}
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
        <button onClick={() => setShowInactive(!showInactive)} className="mt-2 text-[11px] text-gray-500 hover:text-navy">
          {showInactive ? 'Hide' : 'Show'} {inactive} expired or revoked
        </button>
      )}
    </div>
  );
}
