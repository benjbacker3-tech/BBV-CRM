'use client';

import { useEffect, useState } from 'react';

export default function SettingsPage() {
  return (
    <div className="page max-w-3xl">
      <div className="page-header">
        <div>
          <p className="eyebrow">Sandpiper Capital LLC · Workspace</p>
          <h1 className="page-title">Settings</h1>
        </div>
      </div>

      <Health />
      <Backups />
    </div>
  );
}

type Backup = { file: string; webUrl: string; tables: number; rows: number; bytes: number; pruned: number; at: string };

// Nightly database backup to OneDrive (Sandpiper/Backups/CRM), with a manual "Back up now".
function Backups() {
  const [last, setLast] = useState<Backup | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { fetch('/api/backup').then(r => r.json()).then(d => setLast(d.last)).catch(() => {}); }, []);
  const now = async () => {
    setBusy(true);
    setErr(null);
    const r = await fetch('/api/backup', { method: 'POST' }).then(x => x.json()).catch(() => ({ error: 'Network error' }));
    if (r.error) setErr(r.error); else setLast(r);
    setBusy(false);
  };
  return (
    <div className="card card-body mt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="section-label mb-1">Backups</h3>
          <p className="text-xs text-slate-500">Every night at 3am the whole database is saved to OneDrive (Sandpiper / Backups / CRM). The last 30 days are kept, plus one per month for a year.</p>
        </div>
        <button onClick={now} disabled={busy} className="btn-secondary shrink-0">{busy ? 'Backing up…' : 'Back up now'}</button>
      </div>
      <p className="mt-2 text-xs text-slate-600">
        {last
          ? <>Last backup <b>{new Date(last.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</b>: {last.rows.toLocaleString()} records in {last.tables} tables, {(last.bytes / 1024).toFixed(0)} KB · <a href={last.webUrl} target="_blank" rel="noopener noreferrer" className="text-navy underline">{last.file}</a></>
          : 'No backup yet.'}
      </p>
      {err && <p className="mt-1 text-xs text-red-600">{err}</p>}
    </div>
  );
}

type Job = { name: string; label: string; schedule: string; last: { at: string; ok: boolean; detail?: string } | null; lastOk: string | null; stale: boolean; note?: string };

// Whether each automatic job is running: last success, and the error if the last run failed.
function Health() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [ai, setAi] = useState<boolean | null>(null);
  useEffect(() => { fetch('/api/health').then(r => r.json()).then(d => { setJobs(d.jobs); setAi(!!d.ai); }).catch(() => setJobs([])); }, []);
  const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="card mt-4">
      <div className="card-header"><p className="card-title">Automatic jobs</p></div>
      {!jobs ? <p className="px-4 py-3 text-xs text-slate-500">Checking…</p> : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {jobs.map(j => {
            const failed = j.last && !j.last.ok && j.name !== 'brief';
            const tone = failed || j.stale ? 'bg-red-500' : 'bg-emerald-500';
            return (
              <li key={j.name} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-slate-900 dark:text-slate-100">{j.label} <span className="ml-1 text-[11px] font-normal text-slate-400">{j.schedule}</span></p>
                  <p className="text-xs text-slate-500">
                    {j.name === 'brief'
                      ? (j.last ? <>Showing {j.last.detail}{j.stale && <b className="text-red-600"> · more than a business day old</b>}</> : 'No brief yet.')
                      : j.lastOk ? <>Last worked {when(j.lastOk)}{j.last?.ok && j.last.detail ? ` · ${j.last.detail}` : ''}{j.stale && <b className="text-red-600"> · not in the last 36 hours</b>}</> : 'Has not run yet.'}
                  </p>
                  {failed && <p className="text-xs text-red-600">Failed {when(j.last!.at)}: {j.last!.detail}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {ai !== null && (
        <p className="border-t border-slate-100 dark:border-slate-800 px-4 py-2.5 text-xs text-slate-500">
          <b className="text-slate-700 dark:text-slate-200">Claude reading</b> (PSAs, including scans, and broker emails):{' '}
          {ai ? <span className="text-emerald-700">on</span> : <>off. Add <code className="font-mono text-[11px]">ANTHROPIC_API_KEY</code> in Vercel to turn it on; until then the text rules are used.</>}
        </p>
      )}
    </div>
  );
}
