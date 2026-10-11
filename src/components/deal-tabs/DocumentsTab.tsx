'use client';

import { useCallback, useEffect, useState } from 'react';
import { Deal, fmt } from '@/lib/utils';
import { uploadToDrive } from '@/components/DriveUpload';
import ShareDialog, { ShareTarget } from '@/components/ShareDialog';
import SharedLinks from '@/components/SharedLinks';

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
    <a href={item.webUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 py-1.5 pr-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/60 group" style={{ paddingLeft: indent * 14 + 6 }}>
      <span className="pill pill-slate w-9 shrink-0 justify-center !px-0 font-mono font-semibold !text-[9px]">{ICON[ext(item.name)] || ext(item.name).slice(0, 3).toUpperCase() || 'FILE'}</span>
      <span className="flex-1 text-xs text-slate-800 dark:text-slate-200 group-hover:text-navy dark:group-hover:text-blue-300 truncate" title={item.name}>{item.name}</span>
      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tabular-nums shrink-0">{size(item.size)}</span>
      <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono tabular-nums shrink-0 w-16 text-right">{day(item.lastModifiedDateTime)}</span>
    </a>
  );
}

function FolderRow({ item, indent = 0, onShare }: { item: Item; indent?: number; onShare?: (t: ShareTarget) => void }) {
  const [open, setOpen] = useState(false);
  const count = item.folder?.childCount ?? 0;
  return (
    <div>
      <div className="group flex items-center rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/60">
      <button onClick={() => setOpen(!open)} className="flex-1 min-w-0 flex items-center gap-2 py-1.5 pr-2 text-left" style={{ paddingLeft: indent * 14 + 6 }}>
        <svg className={`w-3 h-3 text-slate-400 shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        <svg className="w-4 h-4 text-navy/70 dark:text-blue-300/70 shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z" /></svg>
        <span className="flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-200">{item.name}</span>
        <span className="count">{count}</span>
      </button>
      {onShare && <button onClick={() => onShare({ id: item.id, name: item.name, isFolder: true })} className="btn-ghost !px-2 !py-0.5 !text-[10px] text-navy dark:text-blue-300 opacity-0 group-hover:opacity-100">Share</button>}
      </div>
      {open && (
        <div>
          {(item.children || []).map(c => (c.folder ? <FolderRow key={c.id} item={c} indent={indent + 1} onShare={onShare} /> : <FileRow key={c.id} item={c} indent={indent + 1} />))}
          {count > 0 && !item.children && (
            <a href={item.webUrl} target="_blank" rel="noreferrer" className="block text-[11px] font-medium text-navy dark:text-blue-300 hover:underline py-1" style={{ paddingLeft: (indent + 1) * 14 + 6 }}>Open folder in OneDrive</a>
          )}
          {count === 0 && <p className="text-[11px] text-slate-400 dark:text-slate-500 py-1" style={{ paddingLeft: (indent + 1) * 14 + 6 }}>Empty</p>}
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
  const [sharing, setSharing] = useState<ShareTarget | null>(null);
  const [sharesKey, setSharesKey] = useState(0);

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
    else { setMessage(json.created ? `Created ${json.folder.name}${json.moved ? ` and moved ${json.moved} models / LOIs in` : ''}.` : `Organized ${json.folder.name}.`); load(); }
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
      <div className="card card-body text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        <p className="font-medium text-slate-800 dark:text-slate-100 mb-1">OneDrive isn&apos;t connected yet.</p>
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
      className={`space-y-6 ${dragging ? 'ring-2 ring-navy/40 ring-offset-4 rounded-lg' : ''}`}
      onDragEnter={e => { if (data.folder && e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); } }}
      onDragOver={e => { if (data.folder && e.dataTransfer.types.includes('Files')) { e.preventDefault(); e.stopPropagation(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { if (!data.folder) return; e.preventDefault(); e.stopPropagation(); setDragging(false); upload(e.dataTransfer.files); }}
    >
      {data.error && <p className="text-xs text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-3 py-2">{data.error}</p>}
      {message && <p className="text-xs text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2">{message}</p>}

      {/* Model */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h5 className="section-label">Underwriting model</h5>
          <button onClick={syncModel} disabled={busy === 'sync'} className="btn-secondary">
            {busy === 'sync' ? 'Reading model…' : 'Sync from latest model'}
          </button>
        </div>
        {deal.model_name ? (
          <div className="card card-body !p-3">
            <div className="flex items-baseline justify-between gap-2 mb-3">
              {data.model ? (
                <a href={data.model.webUrl} target="_blank" rel="noreferrer" className="text-xs font-medium text-navy dark:text-blue-300 hover:underline truncate">{deal.model_name}</a>
              ) : (
                <span className="text-xs font-medium text-slate-800 dark:text-slate-100 truncate">{deal.model_name}</span>
              )}
              {deal.model_synced_at && <span className="pill pill-muted shrink-0">synced {day(deal.model_synced_at)}</span>}
            </div>
            <div className="grid grid-cols-4 gap-x-2 gap-y-3">
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
                <div key={l} className="min-w-0"><p className="text-[10px] uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 truncate">{l}</p><p className="mt-0.5 text-xs font-mono tabular-nums text-slate-800 dark:text-slate-100 truncate">{v}</p></div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">No model synced yet. Sync looks in the deal folder (and any Models subfolder) and in Prelim Models, and uses the newest file by the date in its name.</p>
        )}
      </section>

      {/* Folder */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h5 className="section-label">Deal folder</h5>
          {data.folder && (
            <div className="flex items-center gap-1 -mr-2">
              <button onClick={() => setSharing({ id: data.folder!.id, name: data.folder!.name, isFolder: true })} className="btn-ghost">Share</button>
              <a href={data.folder.webUrl} target="_blank" rel="noreferrer" className="btn-ghost text-navy dark:text-blue-300">Open in OneDrive</a>
            </div>
          )}
        </div>
        {data.folder ? (
          <>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 truncate" title={data.folder.name}>{data.folder.name}</p>
            <div className="card p-1.5 max-h-80 overflow-y-auto">
              {tree.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 p-2">Folder is empty.</p>}
              {tree.map(i => (i.folder ? <FolderRow key={i.id} item={i} onShare={setSharing} /> : <FileRow key={i.id} item={i} />))}
            </div>

            {/* Upload */}
            <div className="mt-3 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-3">
              <div className="flex items-center gap-2">
                <select value={target} onChange={e => setTarget(e.target.value)} className="field flex-1 min-w-0">
                  <option value={data.folder.id}>{data.folder.name} (top level)</option>
                  {subfolders.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <label className="btn-primary cursor-pointer shrink-0">
                  Upload
                  <input type="file" multiple className="hidden" onChange={e => { if (e.target.files?.length) upload(e.target.files); e.target.value = ''; }} />
                </label>
              </div>
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2">Or drag files onto this tab. Files go straight to OneDrive, any size.</p>
              {uploads.map(u => (
                <div key={u.name} className="mt-2 text-[11px]">
                  <div className="flex justify-between gap-2 mb-1"><span className="truncate text-slate-700 dark:text-slate-300">{u.name}</span><span className={u.error ? 'text-red-600 dark:text-red-400' : 'font-mono tabular-nums text-slate-500 dark:text-slate-400'}>{u.error || `${Math.round(u.pct * 100)}%`}</span></div>
                  {!u.error && <div className="progress"><div className="progress-bar" style={{ width: `${u.pct * 100}%` }} /></div>}
                </div>
              ))}
            </div>
          </>
        ) : (
          ['Negotiating PSA', 'Under Contract', 'Closed'].includes(deal.stage) ? (
          <div className="card card-body !p-3 text-xs text-slate-600 dark:text-slate-400">
            <p className="mb-2">No folder for this deal yet.</p>
            <button onClick={createFolder} disabled={busy === 'folder'} className="btn-primary">
              {busy === 'folder' ? 'Creating…' : 'Create deal folder'}
            </button>
            <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500 mt-2">Creates the deal folder with 01 Models through 09 Construction and moves this deal&apos;s models and LOIs in from Prelim Models and LOIs.</p>
          </div>
          ) : (
          <p className="card card-body !p-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">A folder is created automatically once the LOI is accepted (stage changes to Negotiating PSA). Until then this deal&apos;s model stays in Prelim Models and its LOIs in LOIs, listed below.</p>
          )
        )}
      </section>

      {data.folder && (
        <section>
          <h5 className="section-label mb-2">Shared links</h5>
          <SharedLinks dealId={deal.id} refreshKey={sharesKey} compact />
        </section>
      )}

      {/* Related */}
      {related.length > 0 && (
        <section>
          <h5 className="section-label mb-2">Elsewhere in OneDrive <span className="count">{related.length}</span></h5>
          <div className="card p-1.5">
            {(data.related?.prelimModels || []).length > 0 && <p className="text-[10px] uppercase tracking-[0.08em] font-medium text-slate-400 dark:text-slate-500 px-1.5 pt-1 pb-0.5">Prelim Models</p>}
            {(data.related?.prelimModels || []).map(i => <FileRow key={i.id} item={i} />)}
            {(data.related?.lois || []).length > 0 && <p className="text-[10px] uppercase tracking-[0.08em] font-medium text-slate-400 dark:text-slate-500 px-1.5 pt-2 pb-0.5">LOIs</p>}
            {(data.related?.lois || []).map(i => <FileRow key={i.id} item={i} />)}
          </div>
        </section>
      )}
      {sharing && <ShareDialog target={sharing} dealId={deal.id} onClose={() => setSharing(null)} onCreated={() => setSharesKey(k => k + 1)} />}
    </div>
  );
}
