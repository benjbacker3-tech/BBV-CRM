'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { COMPANY_FOLDERS } from '@/lib/company-folders';

// Email attachments: what the daily scan filed into deal folders, and what it wants
// a decision on (see lib/mail-filing.ts).

const SUBFOLDERS = ['01 Models', '02 LOI & PSA', '03 Diligence', '04 Debt', '05 Equity', '06 Closing', '07 Leasing & Mgmt', '08 Property Info', '09 Construction'];

interface Row {
  id: number;
  received_at: string;
  sender: string | null;
  subject: string | null;
  web_link: string | null;
  file_name: string;
  size: number | null;
  deal_id: number | null;
  deal_name: string | null;
  folder: string | null;
  status: string;
  reason: string | null;
  drive_web_url: string | null;
}

interface Data {
  rows: Row[];
  counts: Record<string, number>;
  lastRun: { at: string; messages: number; filed: number; review: number; skipped: number; errors: string[]; more: boolean } | null;
  deals: { id: number; label: string; stage: string }[];
  mailAccess: boolean | null;
  configured: boolean;
}

const TABS = [
  { key: 'review', label: 'To review' },
  { key: 'filed', label: 'Filed' },
  { key: 'skipped', label: 'Skipped' },
  { key: 'dismissed', label: 'Dismissed' },
];

const size = (n: number | null) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const when = (s: string) => new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const senderName = (s: string | null) => (s ? s.replace(/\s*<.*>$/, '') || s : '');

export default function InboxPage() {
  const [tab, setTab] = useState('review');
  const [data, setData] = useState<Data | null>(null);
  const [scanning, setScanning] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<number, { dealId: string; folder: string }>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [rowError, setRowError] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/email-files?status=${tab}`);
    setData(await res.json());
  }, [tab]);
  useEffect(() => { setData(null); load(); }, [load]);

  // A timeout comes back as an HTML error page, so the body may not be JSON.
  const post = async (url: string, body: unknown) => {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({ error: `The server timed out (${res.status}).` })) : { error: 'Could not reach the server.' };
    return { ok: !!res?.ok, json };
  };
  const pause = (ms: number) => new Promise(r => setTimeout(r, ms));

  const scan = async () => {
    setMessage(null);
    let total = { messages: 0, filed: 0, review: 0, skipped: 0 };
    let failures = 0;
    let done = false;
    for (let round = 1; round <= 60; round++) {
      setScanning(`Checking email… ${total.messages ? `${total.messages} emails so far` : ''}`);
      const { ok, json } = await post('/api/email-files', { action: 'scan' });
      // Timeouts and dropped connections are usually transient; the scan resumes where it stopped.
      if (!ok || json.errors?.length) {
        failures++;
        if (failures >= 3) { setMessage(`Stopped on an error: ${json.error || json.errors?.[0]}`); break; }
        await pause(3000);
        continue;
      }
      if (json.busy) { setScanning('Another check (the daily run) is in progress; waiting for it…'); await pause(10_000); continue; }
      failures = 0;
      total = { messages: total.messages + json.messages, filed: total.filed + json.filed, review: total.review + json.review, skipped: total.skipped + json.skipped };
      const summary = `Checked ${total.messages} emails with attachments: ${total.filed} filed, ${total.review} to review, ${total.skipped} skipped.`;
      if (!json.more) { setMessage(summary); done = true; break; }
      if (round === 60) setMessage(`${summary} More to go: click Check email now again to continue.`);
    }
    // Earlier review / skipped items get another look with the current rules.
    let re = { checked: 0, filed: 0 };
    for (let round = 1; done && round <= 40; round++) {
      setScanning(`Re-sorting earlier attachments with the latest rules… ${re.checked ? `${re.checked} so far` : ''}`);
      const { ok, json } = await post('/api/email-files', { action: 'recheck' });
      if (!ok) { setMessage(m => `${m ?? ''} Re-sorting stopped: ${json.error}`.trim()); break; }
      if (json.busy) { await pause(10_000); continue; }
      re = { checked: re.checked + json.checked, filed: re.filed + json.filed };
      if (!json.more) break;
    }
    if (re.checked) setMessage(m => `${m ?? ''} Re-sorted ${re.checked} earlier attachments; ${re.filed} more filed.`.trim());
    setScanning(null);
    load();
  };

  const act = async (row: Row, body: Record<string, unknown>) => {
    setBusy(row.id);
    setRowError(e => ({ ...e, [row.id]: '' }));
    const { ok, json } = await post(`/api/email-files/${row.id}`, body);
    setBusy(null);
    if (!ok) { setRowError(e => ({ ...e, [row.id]: json.error || 'Failed' })); return; }
    load();
  };

  const dismissAll = async () => {
    if (!confirm('Dismiss everything in the review list?')) return;
    await fetch('/api/email-files', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'dismiss_all' }) });
    load();
  };

  // dealId '' = nothing chosen, 'company' = a company folder (folder holds its path).
  const pick = (r: Row) => choice[r.id] ?? (r.deal_id ? { dealId: String(r.deal_id), folder: r.folder ?? '' } : COMPANY_FOLDERS.includes(r.folder ?? '') ? { dealId: 'company', folder: r.folder! } : { dealId: '', folder: '' });

  return (
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="flex items-end justify-between mb-5 pb-4 border-b border-gray-200">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1"><Link href="/documents" className="hover:underline">Documents</Link> · Email</p>
          <h1 className="text-xl font-medium text-gray-900 tracking-tight">Email attachments</h1>
        </div>
        {data?.mailAccess && (
          <button onClick={scan} disabled={!!scanning} className="px-4 py-1.5 text-sm text-white bg-navy rounded hover:bg-navy-light disabled:opacity-50">{scanning ? 'Checking…' : 'Check email now'}</button>
        )}
      </div>

      <p className="text-xs text-gray-600 leading-relaxed mb-4 max-w-3xl">
        Every morning the CRM reads new email with attachments (received and sent). When an email names a deal that has a folder (by street address, street name, property LLC, or a city with only one active deal),
        its attachments are saved into the right subfolder, unless an identical copy is already somewhere in that deal&apos;s folder. A match only by email thread waits here for you. Company documents go to the company folders: formation and banking papers, engagement letters and NDAs, investor decks,
        broker OMs, market reports and comps, lender quotes, templates. Anything it isn&apos;t sure about waits here. Only active deals get files: attachments for Dead deals, deals still at Tracking or LOI, and properties that aren&apos;t in the CRM are skipped, as are signatures, invites and mail reports.
      </p>

      {data && data.configured && data.mailAccess === false && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4 max-w-3xl leading-relaxed">
          <p className="font-medium mb-1">The CRM can&apos;t read email yet.</p>
          In Entra → App registrations → Sandpiper CRM → API permissions: Add a permission → Microsoft Graph → <span className="font-medium">Application permissions</span> → tick <span className="font-mono">Mail.Read</span> and <span className="font-mono">Mail.Send</span> (for link alerts) → Add, then <span className="font-medium">Grant admin consent</span>. Reload this page after a minute.
        </div>
      )}

      {scanning && <p className="text-xs text-navy bg-navy/5 border border-navy/20 rounded px-3 py-2 mb-4">{scanning}</p>}
      {message && <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-4">{message}</p>}
      {data?.lastRun && !message && (
        <p className="text-[11px] text-gray-500 mb-4">Last check {when(data.lastRun.at)}: {data.lastRun.filed} filed, {data.lastRun.review} to review, {data.lastRun.skipped} skipped.</p>
      )}

      <div className="flex items-center gap-1 mb-3 border-b border-gray-200">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 text-xs -mb-px border-b-2 ${tab === t.key ? 'border-navy text-navy font-medium' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            {t.label}{data?.counts[t.key] ? <span className="ml-1 text-[10px] text-gray-400">{data.counts[t.key]}</span> : null}
          </button>
        ))}
        {tab === 'review' && !!data?.rows.length && <button onClick={dismissAll} className="ml-auto text-[11px] text-gray-500 hover:text-red-600">Dismiss all</button>}
      </div>

      {!data && <div className="skeleton h-40 w-full" />}
      {data && data.rows.length === 0 && <p className="text-sm text-gray-500 py-6">{tab === 'review' ? 'Nothing to review.' : 'None.'}</p>}

      {data && data.rows.length > 0 && (
        <div className="border border-gray-300">
          {data.rows.map(r => {
            const c = pick(r);
            return (
              <div key={r.id} className="px-3 py-2 border-b border-gray-200 text-xs">
                <div className="flex items-baseline gap-3">
                  {r.drive_web_url ? (
                    <a href={r.drive_web_url} target="_blank" rel="noreferrer" className="font-medium text-gray-900 hover:text-navy hover:underline truncate">{r.file_name}</a>
                  ) : <span className="font-medium text-gray-900 truncate">{r.file_name}</span>}
                  <span className="text-[10px] text-gray-400 font-mono shrink-0">{size(r.size)}</span>
                  <span className="ml-auto text-[11px] text-gray-400 shrink-0">{when(r.received_at)}</span>
                </div>
                <div className="flex items-baseline gap-2 text-[11px] text-gray-500 mt-0.5 min-w-0">
                  <span className="shrink-0">{senderName(r.sender)}</span>
                  <span className="text-gray-300">·</span>
                  {r.web_link ? <a href={r.web_link} target="_blank" rel="noreferrer" className="truncate hover:text-navy hover:underline">{r.subject || '(no subject)'}</a> : <span className="truncate">{r.subject}</span>}
                </div>
                <div className="text-[11px] mt-0.5">
                  {r.status === 'filed' ? (
                    <span className="text-emerald-700">Filed to {r.deal_name ? `${r.deal_name} / ${r.folder || 'top level'}` : r.folder}<span className="text-gray-400"> · {r.reason}</span></span>
                  ) : <span className="text-gray-500">{r.reason}</span>}
                </div>

                {r.status === 'review' && (
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <select value={c.dealId} onChange={e => setChoice(x => ({ ...x, [r.id]: { dealId: e.target.value, folder: e.target.value === 'company' || c.dealId === 'company' ? '' : c.folder } }))} className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 bg-white">
                      <option value="">Deal or company…</option>
                      <optgroup label="Deals">{data.deals.map(d => <option key={d.id} value={d.id}>{d.label} ({d.stage})</option>)}</optgroup>
                      <option value="company">Company folder (not a deal)</option>
                    </select>
                    <select value={c.folder} onChange={e => setChoice(x => ({ ...x, [r.id]: { ...c, folder: e.target.value } }))} className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 bg-white">
                      <option value="">{c.dealId === 'company' ? 'Folder…' : 'Subfolder…'}</option>
                      {(c.dealId === 'company' ? COMPANY_FOLDERS : SUBFOLDERS).map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <button disabled={!c.dealId || !c.folder || busy === r.id} onClick={() => act(r, { action: 'file', dealId: c.dealId === 'company' ? null : c.dealId, folder: c.folder })} className="px-3 py-1 text-xs text-white bg-navy rounded hover:bg-navy-light disabled:opacity-40">
                      {busy === r.id ? 'Saving…' : 'File'}
                    </button>
                    <button disabled={busy === r.id} onClick={() => act(r, { action: 'dismiss' })} className="px-2 py-1 text-xs text-gray-600 hover:text-red-600">Dismiss</button>
                    {rowError[r.id] && <span className="text-[11px] text-red-600">{rowError[r.id]}</span>}
                  </div>
                )}
                {(r.status === 'skipped' || r.status === 'dismissed') && (
                  <button onClick={() => act(r, { action: 'review' })} className="mt-1 text-[11px] text-navy hover:underline">Move to review</button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
