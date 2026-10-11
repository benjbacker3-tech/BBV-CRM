'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { uploadToDrive } from '@/components/DriveUpload';
import ShareDialog, { ShareTarget } from '@/components/ShareDialog';

interface Item {
  id: string;
  name: string;
  size?: number;
  webUrl: string;
  lastModifiedDateTime: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  folderPath?: string | null;
}

interface Status { configured: boolean; ok: boolean; owner?: string; rootPath?: string; rootWebUrl?: string; error?: string; hint?: string }

const size = (n?: number) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const day = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function DocumentsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const path = params.get('path') || '';

  const [status, setStatus] = useState<Status | null>(null);
  const [folder, setFolder] = useState<Item | null>(null);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Item[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [uploads, setUploads] = useState<{ name: string; pct: number; error?: string }[]>([]);
  const [sharing, setSharing] = useState<ShareTarget | null>(null);
  const [inbox, setInbox] = useState<number | null>(null);

  useEffect(() => { fetch('/api/email-files?status=review').then(r => r.json()).then(j => setInbox(j.counts?.review ?? 0)).catch(() => null); }, []);

  useEffect(() => { fetch('/api/drive/status').then(r => r.json()).then(setStatus); }, []);

  const load = useCallback(async () => {
    setItems(null); setError(null);
    const res = await fetch(`/api/drive/browse?path=${encodeURIComponent(path)}`);
    const json = await res.json();
    if (!res.ok) { setError(json.error); setItems([]); return; }
    setFolder(json.folder); setItems(json.items);
  }, [path]);
  useEffect(() => { if (status?.ok) load(); }, [status, load]);

  const go = (p: string) => { setResults(null); setQ(''); router.push(p ? `/documents?path=${encodeURIComponent(p)}` : '/documents'); };

  const runSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!q.trim()) { setResults(null); return; }
    setSearching(true);
    const res = await fetch(`/api/drive/search?q=${encodeURIComponent(q.trim())}`);
    const json = await res.json();
    setSearching(false);
    if (!res.ok) setError(json.error); else setResults(json.items);
  };

  const upload = async (files: FileList) => {
    if (!folder) return;
    const list = Array.from(files);
    setUploads(list.map(f => ({ name: f.name, pct: 0 })));
    for (let i = 0; i < list.length; i++) { const f = list[i];
      try { await uploadToDrive(folder.id, f, pct => setUploads(u => u.map((x, j) => (j === i ? { ...x, pct } : x)))); }
      catch (err) { setUploads(u => u.map((x, j) => (j === i ? { ...x, error: err instanceof Error ? err.message : 'Failed' } : x))); }
    }
    load();
    setTimeout(() => setUploads(u => u.filter(x => x.error)), 4000);
  };

  const crumbs = path ? path.split('/') : [];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Sandpiper Capital LLC · OneDrive</p>
          <h1 className="page-title">Documents</h1>
        </div>
        {status?.ok && folder && (
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <a href="/documents/inbox" className="btn-secondary">Email inbox{inbox ? <span className="pill pill-navy font-mono">{inbox}</span> : null}</a>
            <a href="/documents/shares" className="btn-secondary">Shared links</a>
            <a href="/documents/cleanup" className="btn-secondary">Organize folders</a>
            {path && <button onClick={() => setSharing({ id: folder.id, name: folder.name, isFolder: true })} className="btn-secondary">Share this folder</button>}
            <a href={folder.webUrl} target="_blank" rel="noreferrer" className="btn-secondary">Open in OneDrive</a>
            <label className="btn-primary cursor-pointer">
              Upload here
              <input type="file" multiple className="hidden" onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
        )}
      </div>

      {!status && <div className="skeleton h-40 w-full" />}

      {status && !status.configured && (
        <div className="card card-body text-[13px] text-slate-700 dark:text-slate-300 max-w-2xl">
          <p className="font-medium text-slate-900 dark:text-slate-100 mb-2">OneDrive isn&apos;t connected yet.</p>
          <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
            Add <code className="font-mono">MS_TENANT_ID</code>, <code className="font-mono">MS_CLIENT_ID</code>, <code className="font-mono">MS_CLIENT_SECRET</code> and <code className="font-mono">MS_DRIVE_USER</code> in
            Vercel → Settings → Environment Variables, from the &ldquo;Sandpiper CRM&rdquo; app registration (Microsoft Graph application permission Files.ReadWrite.All, with admin consent). Then redeploy.
          </p>
        </div>
      )}

      {status?.configured && !status.ok && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 rounded-lg px-3 py-2 max-w-3xl space-y-1"><p>{status.error}</p>{status.hint && <p className="text-red-900 dark:text-red-200 font-medium">{status.hint}</p>}</div>
      )}

      {status?.ok && (
        <>
          <form onSubmit={runSearch} className="flex items-center gap-2 mb-4">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search file names and contents across Sandpiper…" className="field flex-1 max-w-xl" />
            <button type="submit" className="btn-primary">{searching ? 'Searching…' : 'Search'}</button>
            {results && <button type="button" onClick={() => { setResults(null); setQ(''); }} className="btn-ghost">Clear</button>}
          </form>

          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 rounded-lg px-3 py-2 mb-3">{error}</p>}

          {uploads.map(u => (
            <div key={u.name} className="mb-2 text-[11px] max-w-xl">
              <div className="flex justify-between mb-0.5"><span className="truncate text-slate-700 dark:text-slate-300">{u.name}</span><span className={u.error ? 'text-red-600' : 'font-mono text-slate-500'}>{u.error || `${Math.round(u.pct * 100)}%`}</span></div>
              {!u.error && <div className="progress"><div className="progress-bar" style={{ width: `${u.pct * 100}%` }} /></div>}
            </div>
          ))}

          {results ? (
            <div className="card overflow-hidden">
              <div className="card-header">
                <h2 className="section-label">Results for &ldquo;{q}&rdquo; <span className="count">{results.length}</span></h2>
              </div>
              {results.map(i => (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2.5 border-b last:border-b-0 border-slate-100 dark:border-slate-800 text-xs hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  {i.folder ? (
                    <button onClick={() => go([i.folderPath, i.name].filter(Boolean).join('/'))} className="font-medium text-navy dark:text-blue-300 hover:underline text-left">{i.name}/</button>
                  ) : (
                    <a href={i.webUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-900 dark:text-slate-100 hover:text-navy hover:underline">{i.name}</a>
                  )}
                  {i.folderPath != null && <button onClick={() => go(i.folderPath || '')} className="text-[11px] text-slate-500 hover:text-navy truncate">in {status.rootPath}/{i.folderPath}</button>}
                  <span className="ml-auto text-slate-400 font-mono tabular-nums shrink-0">{size(i.size)}</span>
                  <span className="text-slate-400 font-mono tabular-nums shrink-0 w-24 text-right">{day(i.lastModifiedDateTime)}</span>
                </div>
              ))}
              {results.length === 0 && <p className="px-3 py-6 text-xs italic text-slate-400">No matches.</p>}
            </div>
          ) : (
            <>
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 text-xs mb-2 flex-wrap">
                <button onClick={() => go('')} className={`hover:underline ${crumbs.length ? 'text-navy dark:text-blue-300' : 'text-slate-900 dark:text-slate-100 font-medium'}`}>{status.rootPath}</button>
                {crumbs.map((c, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="text-slate-300 dark:text-slate-600">/</span>
                    <button onClick={() => go(crumbs.slice(0, i + 1).join('/'))} className={`hover:underline ${i === crumbs.length - 1 ? 'text-slate-900 dark:text-slate-100 font-medium' : 'text-navy dark:text-blue-300'}`}>{c}</button>
                  </span>
                ))}
              </div>

              <div className="card overflow-x-auto">
                <table className="table-clean table-fixed">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th className="!text-right w-[120px]">Modified</th>
                      <th className="!text-right w-[80px]">Size</th>
                      <th className="w-[64px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {items === null && (
                      <tr><td colSpan={4}><div className="space-y-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton h-5 w-full" />)}</div></td></tr>
                    )}
                    {items?.map(i => (
                      <tr key={i.id} className="row group">
                        <td className="truncate">
                          {i.folder ? (
                            <button onClick={() => go([path, i.name].filter(Boolean).join('/'))} className="flex items-center gap-2 text-left font-medium text-slate-900 dark:text-slate-100 hover:text-navy">
                              <svg className="w-4 h-4 text-navy/70 dark:text-blue-300/70 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" /></svg>
                              {i.name}
                              <span className="count">{i.folder.childCount}</span>
                            </button>
                          ) : (
                            <a href={i.webUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-slate-800 dark:text-slate-200 hover:text-navy hover:underline truncate">
                              <span className="w-4 shrink-0" />{i.name}
                            </a>
                          )}
                        </td>
                        <td className="num text-slate-500">{day(i.lastModifiedDateTime)}</td>
                        <td className="num text-slate-400">{i.folder ? '' : size(i.size)}</td>
                        <td className="text-right">
                          <button onClick={() => setSharing({ id: i.id, name: i.name, isFolder: !!i.folder })} className="text-[11px] text-navy dark:text-blue-300 opacity-0 group-hover:opacity-100 hover:underline">Share</button>
                        </td>
                      </tr>
                    ))}
                    {items?.length === 0 && !error && (
                      <tr><td colSpan={4} className="py-6 italic text-slate-400">Empty folder.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
      {sharing && <ShareDialog target={sharing} onClose={() => setSharing(null)} />}
    </div>
  );
}

export default function DocumentsPage() {
  return <Suspense fallback={null}><DocumentsInner /></Suspense>;
}
