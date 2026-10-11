'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CleanupOp, CleanupPlan } from '@/lib/cleanup';

type Result = { id: string; ok: boolean; error?: string };

const KIND: Record<CleanupOp['kind'], { label: string; cls: string }> = {
  create_folder: { label: 'Create', cls: 'pill-green' },
  rename: { label: 'Rename', cls: 'pill-blue' },
  move: { label: 'Move', cls: 'pill-slate' },
  delete: { label: 'Delete', cls: 'pill-red' },
};

function describe(op: CleanupOp, folder: string) {
  const short = (p: string) => (p.startsWith(folder + '/') ? p.slice(folder.length + 1) : p);
  switch (op.kind) {
    case 'create_folder': return <><span className="font-mono">{short(op.path) === op.path ? op.path : short(op.path)}</span></>;
    case 'rename': return <><span className="font-mono">{short(op.path)}</span> <span className="text-slate-400">→</span> <span className="font-mono">{op.newName}</span></>;
    case 'move': return <><span className="font-mono">{short(op.path)}</span> <span className="text-slate-400">→</span> <span className="font-mono">{short(op.toFolder)}/</span></>;
    case 'delete': return <><span className="font-mono">{short(op.path)}</span> <span className="text-slate-400">· keeping</span> <span className="font-mono">{short(op.keep)}</span></>;
  }
}

export default function CleanupPage() {
  const [plan, setPlan] = useState<CleanupPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState<string | null>(null);
  const [results, setResults] = useState<Map<string, Result>>(new Map());

  const load = useCallback(async () => {
    setPlan(null); setError(null);
    const res = await fetch('/api/drive/cleanup');
    const json = await res.json();
    if (!res.ok) { setError(json.error); return; }
    setPlan(json);
    setSelected(new Set((json as CleanupPlan).groups.flatMap(g => g.ops.filter(o => o.defaultOn).map(o => o.id))));
  }, []);
  useEffect(() => { load(); }, [load]);

  const allOps = useMemo(() => plan?.groups.flatMap(g => g.ops) ?? [], [plan]);
  const counts = useMemo(() => {
    const sel = allOps.filter(o => selected.has(o.id));
    return { total: allOps.length, selected: sel.length, deletes: sel.filter(o => o.kind === 'delete').length };
  }, [allOps, selected]);

  const toggle = (id: string) => setSelected(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleGroup = (ops: CleanupOp[], on: boolean) => setSelected(s => { const n = new Set(s); ops.forEach(o => (on ? n.add(o.id) : n.delete(o.id))); return n; });

  const apply = async () => {
    const chosen = allOps.filter(o => selected.has(o.id));
    if (!chosen.length) return;
    if (!confirm(`Apply ${chosen.length} changes to OneDrive?${counts.deletes ? ` ${counts.deletes} duplicate files go to the OneDrive recycle bin (restorable for 93 days).` : ''}`)) return;
    // Folder-level changes for every deal first, so later moves find their destinations.
    const phases: [string, CleanupOp[]][] = [
      ['Creating and renaming folders', chosen.filter(o => o.kind === 'create_folder' || o.kind === 'rename' || (o.kind === 'move' && o.dealFolder))],
      ['Moving files', chosen.filter(o => o.kind === 'move' && !o.dealFolder)],
      ['Removing duplicates', chosen.filter(o => o.kind === 'delete')],
    ];
    const out = new Map<string, Result>();
    for (const [label, ops] of phases) {
      for (let i = 0; i < ops.length; i += 12) {
        setRunning(`${label}… ${Math.min(i + 12, ops.length)} of ${ops.length}`);
        const batch = ops.slice(i, i + 12);
        // A timeout returns an HTML page and a dropped connection throws: mark the batch as
        // not confirmed (some steps may have gone through; a fresh plan will show what's left).
        const res = await fetch('/api/drive/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: batch }) }).catch(() => null);
        const json = res ? await res.json().catch(() => ({})) : {};
        for (const r of (json.results || []) as Result[]) out.set(r.id, r);
        for (const o of batch) if (!out.has(o.id)) out.set(o.id, { id: o.id, ok: false, error: json.error || (res ? `Not confirmed (HTTP ${res.status}); reload the plan to check` : 'Connection lost; reload the plan to check') });
        setResults(new Map(out));
      }
    }
    setRunning(null);
  };

  const failed = Array.from(results.values()).filter(r => !r.ok);
  const done = results.size > 0 && !running;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <p className="eyebrow"><Link href="/documents" className="hover:underline">Documents</Link> · Folder cleanup</p>
          <h1 className="page-title">Organize deal folders</h1>
        </div>
        {plan && !done && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400"><span className="font-mono tabular-nums">{counts.selected}</span> of <span className="font-mono tabular-nums">{counts.total}</span> selected</span>
            <button onClick={apply} disabled={!!running || !counts.selected} className="btn-primary">
              {running ? 'Applying…' : 'Apply selected'}
            </button>
          </div>
        )}
        {done && <button onClick={() => { setResults(new Map()); load(); }} className="btn-secondary">Re-check folders</button>}
      </div>

      <div className="card card-body text-xs text-slate-600 dark:text-slate-400 leading-relaxed mb-6 max-w-3xl">
        Deals get a folder once the LOI is accepted (Negotiating PSA or Under Contract) in <span className="font-mono">Acquisitions/</span>; Closed deals live in <span className="font-mono">Portfolio/</span> and Dead deals in <span className="font-mono">Acquisitions/Dead/</span>.
        Every deal folder has <span className="font-mono">01 Models</span> through <span className="font-mono">09 Construction</span>. Models and LOIs move in from <span className="font-mono">Prelim Models/</span> and <span className="font-mono">LOIs/</span>.
        Duplicates are only removed when byte-for-byte identical to a copy that stays, and go to the OneDrive recycle bin. Uncheck anything you don&apos;t want.
      </div>

      {running && <p className="text-xs text-navy dark:text-blue-300 bg-navy/5 dark:bg-blue-900/20 border border-navy/20 dark:border-blue-800 rounded-lg px-3 py-2 mb-4">{running}</p>}
      {done && (
        <p className={`text-xs rounded-lg px-3 py-2 mb-4 border ${failed.length ? 'text-red-800 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-900/20 dark:border-red-800' : 'text-emerald-800 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-900/20 dark:border-emerald-800'}`}>
          Applied {results.size - failed.length} of {results.size} changes.{failed.length ? ` ${failed.length} failed; see the items marked below.` : ''} Click Re-check folders to confirm what&apos;s left.
        </p>
      )}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 dark:bg-red-900/20 dark:border-red-800 dark:text-red-300 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {!plan && !error && <p className="text-xs text-slate-500">Reading your OneDrive folders… this takes up to half a minute.</p>}

      {plan && plan.groups.length === 0 && <p className="text-[13px] text-slate-700 dark:text-slate-300">Everything is already organized.</p>}

      <div className="space-y-4">
        {plan?.groups.map(g => {
          const allOn = g.ops.every(o => selected.has(o.id));
          return (
            <div key={g.folder} className="card overflow-hidden">
              <div className="card-header">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="card-title !text-navy dark:!text-blue-300">{g.title}</h2>
                  <span className="pill pill-slate">{g.stage || 'existing folder'}</span>
                  <span className="text-[11px] text-slate-500 font-mono truncate">{g.folder}</span>
                </div>
                {!done && <button onClick={() => toggleGroup(g.ops, !allOn)} className="btn-ghost shrink-0">{allOn ? 'Uncheck all' : 'Check all'}</button>}
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {g.ops.map(o => {
                  const r = results.get(o.id);
                  return (
                    <label key={o.id} className={`flex items-start gap-3 px-4 py-2 text-xs ${done ? '' : 'cursor-pointer hover:bg-slate-50/70 dark:hover:bg-slate-800/40'} ${!selected.has(o.id) ? 'opacity-50' : ''}`}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} disabled={!!running || done} className="mt-0.5 accent-navy" />
                      <span className={`pill ${KIND[o.kind].cls} shrink-0 w-14 justify-center`}>{KIND[o.kind].label}</span>
                      <span className="flex-1 text-slate-800 dark:text-slate-200 break-all">{describe(o, g.folder)}<span className="block text-[10px] text-slate-400">{o.reason}</span></span>
                      {r && <span className={`pill shrink-0 ${r.ok ? 'pill-green' : 'pill-red'}`} title={r.error}>{r.ok ? 'Done' : `Failed: ${r.error}`}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {plan && plan.notes.length > 0 && (
        <div className="card card-body mt-6">
          <h3 className="section-label mb-2">Notes <span className="count">{plan.notes.length}</span></h3>
          <ul className="list-disc pl-4 space-y-1 text-xs text-slate-700 dark:text-slate-300">{plan.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
