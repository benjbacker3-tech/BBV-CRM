'use client';

import { useCallback, useEffect, useState } from 'react';
import { uploadViaSession } from '@/components/DriveUpload';

// Public share page for vendors and consultants (no CRM login). Everything it can
// see or do is decided by the link's server-side checks in /api/share/<token>.

interface Entry { id: string; name: string; size?: number; modified: string; isFolder: boolean; count: number }
interface View {
  share: { name: string; recipient: string; mode: string; isFolder: boolean; expires: string | null; canView: boolean; canUpload: boolean };
  current: Entry;
  trail: { id: string; name: string }[];
  items: Entry[];
}

const size = (n?: number) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const day = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

export default function SharePage({ params }: { params: { token: string } }) {
  const api = `/api/share/${params.token}`;
  const [view, setView] = useState<View | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locked, setLocked] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [unlocking, setUnlocking] = useState(false);
  const [uploads, setUploads] = useState<{ name: string; pct: number; error?: string; done?: boolean }[]>([]);
  const [dragging, setDragging] = useState(false);
  const [thanks, setThanks] = useState<string | null>(null);

  const load = useCallback(async (folderId: string | null) => {
    setError(null);
    const res = await fetch(folderId ? `${api}?folder=${encodeURIComponent(folderId)}` : api).catch(() => null);
    if (!res) { setError('Could not reach the server. Check your connection and reload.'); return; }
    const json = await res.json().catch(() => ({}));
    if (res.status === 401 && json.needsPassword) { setLocked(json.name || 'Shared files'); return; }
    if (!res.ok) { setError(json.error || 'Something went wrong.'); return; }
    setLocked(null);
    setView(json);
  }, [api]);
  useEffect(() => { load(folder); }, [load, folder]);

  const submitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlocking(true); setError(null);
    const res = await fetch(`${api}/unlock`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password }) }).catch(() => null);
    const json = res ? await res.json().catch(() => ({})) : { error: 'Could not reach the server. Check your connection.' };
    setUnlocking(false);
    if (!res?.ok) { setError(json.error || 'Wrong password.'); return; }
    setPassword('');
    load(folder);
  };

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter(f => f.size > 0);
    if (!list.length || !view) return;
    setThanks(null);
    setUploads(list.map(f => ({ name: f.name, pct: 0 })));
    const ids: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const f = list[i];
      try {
        const item = await uploadViaSession(`${api}/upload`, { name: f.name, folderId: view.current.id }, f, pct => setUploads(u => u.map((x, j) => (j === i ? { ...x, pct } : x))));
        if (item?.id) ids.push(item.id);
        setUploads(u => u.map((x, j) => (j === i ? { ...x, pct: 1, done: true } : x)));
      } catch (err) {
        setUploads(u => u.map((x, j) => (j === i ? { ...x, error: err instanceof Error ? err.message : 'Failed' } : x)));
      }
    }
    if (ids.length) {
      await fetch(`${api}/uploaded`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }) }).catch(() => null);
      setThanks(`Uploaded ${ids.length} file${ids.length === 1 ? '' : 's'}. Thank you.`);
      if (view.share.canView) load(folder);
    }
  };

  return (
    <div className="min-h-full w-full bg-gray-50">
      <header className="bg-navy text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold tracking-wide">Sandpiper Capital LLC</span>
          <span className="text-[11px] text-white/70">Shared files</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {locked !== null && (
          <form onSubmit={submitPassword} className="max-w-sm mx-auto bg-white border border-gray-200 rounded-lg p-6 mt-8">
            <h1 className="text-base font-medium text-gray-900 mb-1">{locked}</h1>
            <p className="text-xs text-gray-500 mb-4">This link is password protected.</p>
            <input type="password" autoFocus value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 mb-3" />
            {error && <p className="text-xs text-red-700 mb-3">{error}</p>}
            <button disabled={unlocking || !password} className="w-full px-3 py-2 text-sm text-white bg-navy rounded hover:bg-navy-light disabled:opacity-50">{unlocking ? 'Checking…' : 'Open'}</button>
          </form>
        )}

        {locked === null && error && !view && (
          <div className="max-w-md mx-auto bg-white border border-gray-200 rounded-lg p-6 mt-8 text-center">
            <p className="text-sm text-gray-800">{error}</p>
            <p className="text-xs text-gray-500 mt-2">Ask your Sandpiper contact for a new link.</p>
          </div>
        )}

        {locked === null && !view && !error && <div className="skeleton h-40 w-full" />}

        {locked === null && view && (
          <>
            <div className="mb-5">
              <h1 className="text-xl font-medium text-gray-900 tracking-tight break-words">{view.share.name}</h1>
              <p className="text-xs text-gray-500 mt-1">
                Shared with {view.share.recipient}
                {view.share.expires && <> · available until {day(view.share.expires)}</>}
              </p>
            </div>

            {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-3">{error}</p>}

            {view.share.canUpload && (
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
                className={`mb-5 border-2 border-dashed rounded-lg p-6 text-center bg-white ${dragging ? 'border-navy bg-navy/5' : 'border-gray-300'}`}
              >
                <p className="text-sm text-gray-800 mb-1">Drop files here to send them to Sandpiper</p>
                <p className="text-xs text-gray-500 mb-3">{view.share.canView ? <>Files go into <span className="font-medium">{view.current.name}</span>.</> : 'Any file type and size.'}</p>
                <label className="inline-block px-4 py-2 text-sm text-white bg-navy rounded hover:bg-navy-light cursor-pointer">
                  Choose files
                  <input type="file" multiple className="hidden" onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
                </label>
                {uploads.length > 0 && (
                  <div className="mt-4 space-y-1.5 text-left max-w-md mx-auto">
                    {uploads.map((u, i) => (
                      <div key={i} className="text-[11px]">
                        <div className="flex justify-between gap-2"><span className="truncate text-gray-700">{u.name}</span><span className={u.error ? 'text-red-600' : u.done ? 'text-emerald-600' : 'text-gray-500'}>{u.error || (u.done ? 'Done' : `${Math.round(u.pct * 100)}%`)}</span></div>
                        {!u.error && !u.done && <div className="h-1 bg-gray-100 rounded"><div className="h-1 bg-navy rounded" style={{ width: `${u.pct * 100}%` }} /></div>}
                      </div>
                    ))}
                  </div>
                )}
                {thanks && <p className="mt-3 text-xs text-emerald-700">{thanks}</p>}
              </div>
            )}

            {view.share.canView && (
              <>
                {view.trail.length > 1 && (
                  <div className="flex items-center gap-1 text-xs mb-2 flex-wrap">
                    {view.trail.map((t, i) => (
                      <span key={t.id} className="flex items-center gap-1">
                        {i > 0 && <span className="text-gray-400">/</span>}
                        <button onClick={() => setFolder(i === 0 ? null : t.id)} className={i === view.trail.length - 1 ? 'text-gray-900 font-medium' : 'text-navy hover:underline'}>{t.name}</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="bg-white border border-gray-300 rounded overflow-hidden">
                  {!view.current.isFolder ? (
                    <Row e={view.current} href={`${api}/download?id=${encodeURIComponent(view.current.id)}`} />
                  ) : view.items.length === 0 ? (
                    <p className="px-4 py-6 text-xs text-gray-500">This folder is empty.</p>
                  ) : (
                    view.items.map(e => e.isFolder ? (
                      <button key={e.id} onClick={() => setFolder(e.id)} className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0 text-left hover:bg-gray-50">
                        <svg className="w-4 h-4 text-navy/70 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" /></svg>
                        <span className="flex-1 text-sm text-gray-900 truncate">{e.name}</span>
                        <span className="text-[11px] text-gray-400">{e.count} item{e.count === 1 ? '' : 's'}</span>
                      </button>
                    ) : (
                      <Row key={e.id} e={e} href={`${api}/download?id=${encodeURIComponent(e.id)}`} />
                    ))
                  )}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Row({ e, href }: { e: Entry; href: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-100 last:border-0">
      <span className="flex-1 min-w-0 text-sm text-gray-900 truncate" title={e.name}>{e.name}</span>
      <span className="hidden sm:inline text-[11px] text-gray-400 w-24 text-right">{day(e.modified)}</span>
      <span className="text-[11px] text-gray-400 font-mono w-16 text-right">{size(e.size)}</span>
      <a href={href} className="text-xs text-navy font-medium hover:underline shrink-0">Download</a>
    </div>
  );
}
