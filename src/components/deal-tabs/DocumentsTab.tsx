'use client';

import { useCallback, useEffect, useState } from 'react';
import { Deal, fmt } from '@/lib/utils';
import { uploadToDrive } from '@/components/DriveUpload';

interface Item {
  id: string;
  name: string;
  size?: number;
  webUrl: string;
  lastModifiedDateTime: string;
  folder?: { childCount: number };
  file?: { mimeType: string };
  children?: Item[];
}

interface DocsResponse {
  configured: boolean;
  error?: string;
  folder?: Item | null;
  tree?: Item[];
  related?: { prelimModels: Item[]; lois: Item[] };
  model?: Item | null;
  modelSyncedAt?: string | null;
}

const size = (n?: number) => (n == null ? '' : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const day = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
const ext = (n: string) => (n.split('.').pop() || '').toLowerCase();
const ICON: Record<string, string> = { pdf: 'PDF', xlsx: 'XLS', xlsm: 'XLS', xls: 'XLS', csv: 'CSV', docx: 'DOC', doc: 'DOC', pptx: 'PPT', jpg: 'IMG', jpeg: 'IMG', png: 'IMG', heic: 'IMG', mp4: 'VID', mov: 'VID', zip: 'ZIP', msg: 'EML', eml: 'EML' };

function FileRow({ item, indent = 0 }: { item: Item; indent?: number }) {
  return (
    <a href={item.webUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-1 pr-1 rounded hover:bg-gray-50 group" style={{ paddingLeft: indent * 14 + 4 }}>
      <span className="w-8 shrink-0 text-[9px] font-mono font-semibold text-center text-gray-500 bg-gray-100 rounded py-0.5">{ICON[ext(item.name)] || ext(item.name).slice(0, 3).toUpperCase() || 'FILE'}</span>
      <span className="flex-1 text-xs text-gray-800 group-hover:text-navy truncate" title={item.name}>{item.name}</span>
      <span className="text-[10px] text-gray-400 font-mono shrink-0">{size(item.size)}</span>
      <span className="text-[10px] text-gray-400 shrink-0 w-16 text-right">{day(item.lastModifiedDateTime)}</span>
    </a>
  );
}

function FolderRow({ item, indent = 0 }: { item: Item; indent?: number }) {
  const [open, setOpen] = useState(false);
  const count = item.folder?.childCount ?? 0;
  return (
    <div>
      <button onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 py-1 pr-1 rounded hover:bg-gray-50 text-left" style={{ paddingLeft: indent * 14 + 4 }}>
        <svg className={`w-3 h-3 text-gray-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        <svg className="w-4 h-4 text-navy/70 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" /></svg>
        <span className="flex-1 text-xs font-medium text-gray-800">{item.name}</span>
        <span className="text-[10px] text-gray-400 font-mono">{count}</span>
      </button>
      {open && (
        <div>
          {(item.children || []).map(c => (c.folder ? <FolderRow key={c.id} item={c} indent={indent + 1} /> : <FileRow key={c.id} item={c} indent={indent + 1} />))}
          {count > 0 && !item.children && (
            <a href={item.webUrl} target="_blank" rel="noreferrer" className="block text-[11px] text-navy underline py-1" style={{ paddingLeft: (indent + 1) * 14 + 4 }}>Open folder in OneDrive</a>
          )}
          {count === 0 && <p className="text-[11px] text-gray-400 py-1" style={{ paddingLeft: (indent + 1) * 14 + 4 }}>Empty</p>}
        </div>
      )}
    </div>
  );
}

export default function DocumentsTab({ deal, onUpdate }: { deal: Deal; onUpdate: (d: Deal) => void }) {
  const [data, setData] = useState<DocsResponse | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [target, setTarget] = useState<string>('');
  const [uploads, setUploads] = useState<{ name: string; pct: number; error?: string }[]>([]);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/deals/${deal.id}/documents`);
    const json: DocsResponse = await res.json();
    setData(json);
    if (json.folder) setTarget(prev => prev || json.folder!.id);
  }, [deal.id]);
  useEffect(() => { setData(null); setTarget(''); load(); }, [load]);

  const syncModel = async () => {
    setBusy('sync'); setMessage(null);
    const res = await fetch(`/api/deals/${deal.id}/model-sync`, { method: 'POST' });
    const json = await res.json();
    setBusy(null);
    const r = json.result;
    if (!res.ok) setMessage(json.error || 'Sync failed');
    else if (r.status === 'updated') { setMessage(`Updated from ${r.model}`); onUpdate(json.deal); load(); }
    else if (r.status === 'no_model') setMessage('No model found in the deal folder or Prelim Models.');
    else if (r.status === 'no_outputs') setMessage(`${r.model} doesn't have the IOS model's Assumptions layout.`);
    else if (r.status === 'price_mismatch') setMessage(`Skipped ${r.model}: it underwrites a ${Math.round(r.modelPrice).toLocaleString('en-US')} purchase, but the deal is at ${Math.round(r.dealPrice).toLocaleString('en-US')}. Save an updated model and sync again.`);
    else if (r.status === 'error') setMessage(r.error);
    else setMessage(`Already up to date (${r.model}).`);
  };

  const createFolder = async () => {
    setBusy('folder'); setMessage(null);
    const res = await fetch(`/api/deals/${deal.id}/documents/folder`, { method: 'POST' });
    const json = await res.json();
    setBusy(null);
    if (!res.ok) setMessage(json.error || 'Could not create folder');
    else { setMessage(json.created ? `Created ${json.folder.name} with the standard subfolders.` : `Found existing folder ${json.folder.name}.`); load(); }
  };

  const upload = async (files: FileList | File[]) => {
    if (!target) return;
    const list = Array.from(files);
    setUploads(list.map(f => ({ name: f.name, pct: 0 })));
    for (let i = 0; i < list.length; i++) { const f = list[i];
      try {
        await uploadToDrive(target, f, pct => setUploads(u => u.map((x, j) => (j === i ? { ...x, pct } : x))));
      } catch (e) {
        setUploads(u => u.map((x, j) => (j === i ? { ...x, error: e instanceof Error ? e.message : 'Failed' } : x)));
      }
    }
    load();
    setTimeout(() => setUploads(u => u.filter(x => x.error)), 4000);
  };

  if (!data) return <div className="space-y-2">{[0, 1, 2, 3].map(i => <div key={i} className="skeleton h-6 w-full" />)}</div>;

  if (!data.configured) {
    return (
      <div className="border border-gray-200 rounded-lg p-4 text-xs text-gray-600 leading-relaxed">
        <p className="font-medium text-gray-800 mb-1">OneDrive isn&apos;t connected yet.</p>
        Once the Microsoft app registration is added to Vercel, this tab shows the deal&apos;s OneDrive folder, related models and LOIs, and lets you upload files.
        Until then, you can drop a deal model onto the Pipeline page to update this deal&apos;s returns and fees.
      </div>
    );
  }

  const tree = data.tree || [];
  const subfolders = tree.filter(i => i.folder);
  const related = [...(data.related?.prelimModels || []), ...(data.related?.lois || [])];

  return (
    <div
      className={`space-y-5 ${dragging ? 'ring-2 ring-navy/40 rounded-lg' : ''}`}
      onDragEnter={e => { if (data.folder && e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); } }}
      onDragOver={e => { if (data.folder && e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { if (!data.folder) return; e.preventDefault(); e.stopPropagation(); setDragging(false); upload(e.dataTransfer.files); }}
    >
      {data.error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{data.error}</p>}
      {message && <p className="text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded px-3 py-2">{message}</p>}

      {/* Model */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-semibold">Underwriting model</h5>
          <button onClick={syncModel} disabled={busy === 'sync'} className="text-xs text-navy font-medium hover:underline disabled:opacity-50">
            {busy === 'sync' ? 'Reading model…' : 'Sync from latest model'}
          </button>
        </div>
        {deal.model_name ? (
          <div className="border border-gray-200 rounded-lg p-3">
            <div className="flex items-baseline justify-between gap-2 mb-2">
              {data.model ? (
                <a href={data.model.webUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-navy hover:underline truncate">{deal.model_name}</a>
              ) : (
                <span className="text-xs font-medium text-gray-800 truncate">{deal.model_name}</span>
              )}
              {deal.model_synced_at && <span className="text-[10px] text-gray-400 shrink-0">synced {day(deal.model_synced_at)}</span>}
            </div>
            <div className="grid grid-cols-4 gap-2 text-[11px]">
              {[
                ['Levered IRR', deal.irr != null ? `${(deal.irr * 100).toFixed(1)}%` : '—'],
                ['EM', deal.em != null ? `${deal.em.toFixed(2)}x` : '—'],
                ['All-in', deal.all_in_basis ? fmt(deal.all_in_basis) : '—'],
                ['Equity', deal.equity_required ? fmt(deal.equity_required) : '—'],
                ['Acq fee', deal.fee_acq ? fmt(deal.fee_acq) : '—'],
                ['Constr fee', deal.fee_construction ? fmt(deal.fee_construction) : '—'],
                ['Leasing fee', deal.fee_leasing ? fmt(deal.fee_leasing) : '—'],
                ['AM fee', deal.fee_am ? fmt(deal.fee_am) : '—'],
              ].map(([l, v]) => (
                <div key={l}><p className="text-[9px] uppercase tracking-wide text-gray-400">{l}</p><p className="font-mono text-gray-900">{v}</p></div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-500">No model synced yet. Sync looks in the deal folder (and any Models subfolder) and in Prelim Models, and uses the newest file by the date in its name.</p>
        )}
      </section>

      {/* Folder */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-semibold">Deal folder</h5>
          {data.folder && <a href={data.folder.webUrl} target="_blank" rel="noreferrer" className="text-xs text-navy font-medium hover:underline">Open in OneDrive</a>}
        </div>
        {data.folder ? (
          <>
            <p className="text-[11px] text-gray-500 mb-2 truncate" title={data.folder.name}>{data.folder.name}</p>
            <div className="border border-gray-200 rounded-lg p-1.5 max-h-80 overflow-y-auto">
              {tree.length === 0 && <p className="text-xs text-gray-400 p-2">Folder is empty.</p>}
              {tree.map(i => (i.folder ? <FolderRow key={i.id} item={i} /> : <FileRow key={i.id} item={i} />))}
            </div>

            {/* Upload */}
            <div className="mt-3 border border-dashed border-gray-300 rounded-lg p-3">
              <div className="flex items-center gap-2">
                <select value={target} onChange={e => setTarget(e.target.value)} className="flex-1 border border-gray-300 rounded px-2 py-1 text-xs text-gray-800 bg-white">
                  <option value={data.folder.id}>{data.folder.name} (top level)</option>
                  {subfolders.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <label className="px-2.5 py-1 text-xs text-white bg-navy rounded hover:bg-navy-light cursor-pointer">
                  Upload
                  <input type="file" multiple className="hidden" onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
                </label>
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">Or drag files onto this tab. Files go straight to OneDrive, any size.</p>
              {uploads.map(u => (
                <div key={u.name} className="mt-1.5 text-[11px]">
                  <div className="flex justify-between"><span className="truncate text-gray-700">{u.name}</span><span className={u.error ? 'text-red-600' : 'text-gray-500'}>{u.error || `${Math.round(u.pct * 100)}%`}</span></div>
                  {!u.error && <div className="h-1 bg-gray-100 rounded"><div className="h-1 bg-navy rounded" style={{ width: `${u.pct * 100}%` }} /></div>}
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="border border-gray-200 rounded-lg p-3 text-xs text-gray-600">
            <p className="mb-2">No folder for this deal in Acquisitions yet.</p>
            <button onClick={createFolder} disabled={busy === 'folder'} className="px-3 py-1.5 text-xs text-white bg-navy rounded hover:bg-navy-light disabled:opacity-50">
              {busy === 'folder' ? 'Creating…' : 'Create deal folder'}
            </button>
            <p className="text-[10px] text-gray-400 mt-2">Creates Acquisitions/{[deal.address || deal.name, deal.city, deal.state].filter(Boolean).join(', ')} with 01 Models through 08 Property Info.</p>
          </div>
        )}
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section>
          <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-semibold mb-2">Elsewhere in OneDrive</h5>
          <div className="border border-gray-200 rounded-lg p-1.5">
            {(data.related?.prelimModels || []).length > 0 && <p className="text-[10px] text-gray-400 px-1 pt-1">Prelim Models</p>}
            {(data.related?.prelimModels || []).map(i => <FileRow key={i.id} item={i} />)}
            {(data.related?.lois || []).length > 0 && <p className="text-[10px] text-gray-400 px-1 pt-1">LOIs</p>}
            {(data.related?.lois || []).map(i => <FileRow key={i.id} item={i} />)}
          </div>
        </section>
      )}
    </div>
  );
}
