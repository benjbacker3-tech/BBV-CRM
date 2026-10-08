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
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="flex items-end justify-between mb-5 pb-4 border-b border-gray-200">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1">Sandpiper Capital LLC · OneDrive</p>
          <h1 className="text-xl font-medium text-gray-900 tracking-tight">Documents</h1>
        </div>
        {status?.ok && folder && (
          <div className="flex items-center gap-2">
            <a href="/documents/inbox" className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Email inbox{inbox ? <span className="ml-1.5 text-[10px] font-semibold text-white bg-navy rounded-full px-1.5">{inbox}</span> : null}</a>
            <a href="/documents/shares" className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Shared links</a>
            <a href="/documents/cleanup" className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Organize folders</a>
            {path && <button onClick={() => setSharing({ id: folder.id, name: folder.name, isFolder: true })} className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Share this folder</button>}
            <a href={folder.webUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Open in OneDrive</a>
            <label className="px-3 py-1.5 text-xs text-white bg-navy rounded hover:bg-navy-light cursor-pointer">
              Upload here
              <input type="file" multiple className="hidden" onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
            </label>
          </div>
        )}
      </div>

      {!status && <div className="skeleton h-40 w-full" />}

      {status && !status.configured && (
        <div className="border border-gray-200 rounded-lg p-6 text-sm text-gray-700 max-w-2xl">
          <p className="font-medium text-gray-900 mb-2">OneDrive isn&apos;t connected yet.</p>
          <p className="text-xs leading-relaxed text-gray-600">
            Add <code className="font-mono">MS_TENANT_ID</code>, <code className="font-mono">MS_CLIENT_ID</code>, <code className="font-mono">MS_CLIENT_SECRET</code> and <code className="font-mono">MS_DRIVE_USER</code> in
            Vercel → Settings → Environment Variables, from the &ldquo;Sandpiper CRM&rdquo; app registration (Microsoft Graph application permission Files.ReadWrite.All, with admin consent). Then redeploy.
          </p>
        </div>
      )}

      {status?.configured && !status.ok && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 max-w-3xl space-y-1"><p>{status.error}</p>{status.hint && <p className="text-red-900 font-medium">{status.hint}</p>}</div>
      )}

      {status?.ok && (
        <>
          <form onSubmit={runSearch} className="flex items-center gap-2 mb-4">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search file names and contents across Sandpiper…" className="flex-1 max-w-xl border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-900" />
            <button type="submit" className="px-3 py-1.5 text-xs text-white bg-navy rounded hover:bg-navy-light">{searching ? 'Searching…' : 'Search'}</button>
            {results && <button type="button" onClick={() => { setResults(null); setQ(''); }} className="text-xs text-gray-500 hover:text-gray-800">Clear</button>}
          </form>

          {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</p>}

          {uploads.map(u => (
            <div key={u.name} className="mb-1.5 text-[11px] max-w-xl">
              <div className="flex justify-between"><span className="truncate text-gray-700">{u.name}</span><span className={u.error ? 'text-red-600' : 'text-gray-500'}>{u.error || `${Math.round(u.pct * 100)}%`}</span></div>
              {!u.error && <div className="h-1 bg-gray-100 rounded"><div className="h-1 bg-navy rounded" style={{ width: `${u.pct * 100}%` }} /></div>}
            </div>
          ))}

          {results ? (
            <div className="border border-gray-300">
              <div className="bg-navy text-white text-[10px] uppercase tracking-[0.06em] font-semibold px-3 py-1.5">{results.length} results for &ldquo;{q}&rdquo;</div>
              {results.map(i => (
                <div key={i.id} className="flex items-center gap-3 px-3 py-2 border-b border-gray-200 text-xs hover:bg-gray-50">
                  {i.folder ? (
                    <button onClick={() => go([i.folderPath, i.name].filter(Boolean).join('/'))} className="font-medium text-navy hover:underline text-left">{i.name}/</button>
                  ) : (
                    <a href={i.webUrl} target="_blank" rel="noreferrer" className="font-medium text-gray-900 hover:text-navy hover:underline">{i.name}</a>
                  )}
                  {i.folderPath != null && <button onClick={() => go(i.folderPath || '')} className="text-gray-500 hover:text-navy truncate">in {status.rootPath}/{i.folderPath}</button>}
                  <span className="ml-auto text-gray-400 font-mono shrink-0">{size(i.size)}</span>
                  <span className="text-gray-400 shrink-0 w-24 text-right">{day(i.lastModifiedDateTime)}</span>
                </div>
              ))}
              {results.length === 0 && <p className="px-3 py-6 text-xs text-gray-500">No matches.</p>}
            </div>
          ) : (
            <>
              {/* Breadcrumb */}
              <div className="flex items-center gap-1 text-xs mb-2 flex-wrap">
                <button onClick={() => go('')} className={`hover:underline ${crumbs.length ? 'text-navy' : 'text-gray-900 font-medium'}`}>{status.rootPath}</button>
                {crumbs.map((c, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="text-gray-400">/</span>
                    <button onClick={() => go(crumbs.slice(0, i + 1).join('/'))} className={`hover:underline ${i === crumbs.length - 1 ? 'text-gray-900 font-medium' : 'text-navy'}`}>{c}</button>
                  </span>
                ))}
              </div>

              <div className="border border-gray-300">
                <div className="grid grid-cols-[1fr_120px_80px_56px] bg-navy text-white text-[10px] uppercase tracking-[0.06em] font-semibold px-3 py-1.5">
                  <span>Name</span><span className="text-right">Modified</span><span className="text-right">Size</span><span />
                </div>
                {items === null && <div className="p-3 space-y-2">{[0, 1, 2, 3, 4].map(i => <div key={i} className="skeleton h-5 w-full" />)}</div>}
                {items?.map(i => (
                  <div key={i.id} className="group grid grid-cols-[1fr_120px_80px_56px] items-center px-3 py-1.5 border-b border-gray-200 text-xs hover:bg-gray-50">
                    {i.folder ? (
                      <button onClick={() => go([path, i.name].filter(Boolean).join('/'))} className="flex items-center gap-2 text-left font-medium text-gray-900 hover:text-navy">
                        <svg className="w-4 h-4 text-navy/70 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" /></svg>
                        {i.name}
                        <span className="text-[10px] text-gray-400 font-mono font-normal">{i.folder.childCount}</span>
                      </button>
                    ) : (
                      <a href={i.webUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-gray-800 hover:text-navy hover:underline truncate">
                        <span className="w-4 shrink-0" />{i.name}
                      </a>
                    )}
                    <span className="text-right text-gray-500">{day(i.lastModifiedDateTime)}</span>
                    <span className="text-right text-gray-400 font-mono">{i.folder ? '' : size(i.size)}</span>
                    <button onClick={() => setSharing({ id: i.id, name: i.name, isFolder: !!i.folder })} className="text-right text-[11px] text-navy opacity-0 group-hover:opacity-100 hover:underline">Share</button>
                  </div>
                ))}
                {items?.length === 0 && !error && <p className="px-3 py-6 text-xs text-gray-500">Empty folder.</p>}
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
