'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { CleanupOp, CleanupPlan } from '@/lib/cleanup';

type Result = { id: string; ok: boolean; error?: string };

const KIND: Record<CleanupOp['kind'], { label: string; cls: string }> = {
  create_folder: { label: 'Create', cls: 'bg-emerald-50 text-emerald-700' },
  rename: { label: 'Rename', cls: 'bg-blue-50 text-blue-700' },
  move: { label: 'Move', cls: 'bg-gray-100 text-gray-700' },
  delete: { label: 'Delete', cls: 'bg-red-50 text-red-700' },
};

function describe(op: CleanupOp, folder: string) {
  const short = (p: string) => (p.startsWith(folder + '/') ? p.slice(folder.length + 1) : p);
  switch (op.kind) {
    case 'create_folder': return <><span className="font-mono">{short(op.path) === op.path ? op.path : short(op.path)}</span></>;
    case 'rename': return <><span className="font-mono">{short(op.path)}</span> <span className="text-gray-400">→</span> <span className="font-mono">{op.newName}</span></>;
    case 'move': return <><span className="font-mono">{short(op.path)}</span> <span className="text-gray-400">→</span> <span className="font-mono">{short(op.toFolder)}/</span></>;
    case 'delete': return <><span className="font-mono">{short(op.path)}</span> <span className="text-gray-400">· keeping</span> <span className="font-mono">{short(op.keep)}</span></>;
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
        const res = await fetch('/api/drive/cleanup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops: ops.slice(i, i + 12) }) });
        const json = await res.json();
        for (const r of (json.results || []) as Result[]) out.set(r.id, r);
        if (!res.ok) for (const o of ops.slice(i, i + 12)) out.set(o.id, { id: o.id, ok: false, error: json.error || `HTTP ${res.status}` });
        setResults(new Map(out));
      }
    }
    setRunning(null);
  };

  const failed = Array.from(results.values()).filter(r => !r.ok);
  const done = results.size > 0 && !running;

  return (
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="flex items-end justify-between mb-5 pb-4 border-b border-gray-200">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1"><Link href="/documents" className="hover:underline">Documents</Link> · Folder cleanup</p>
          <h1 className="text-xl font-medium text-gray-900 tracking-tight">Organize deal folders</h1>
        </div>
        {plan && !done && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-600">{counts.selected} of {counts.total} selected</span>
            <button onClick={apply} disabled={!!running || !counts.selected} className="px-4 py-1.5 text-sm text-white bg-navy rounded hover:bg-navy-light disabled:opacity-50">
              {running ? 'Applying…' : 'Apply selected'}
            </button>
          </div>
        )}
        {done && <button onClick={() => { setResults(new Map()); load(); }} className="px-4 py-1.5 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Re-check folders</button>}
      </div>

      <div className="text-xs text-gray-600 leading-relaxed mb-5 max-w-3xl">
        Deals get a folder once the LOI is accepted (Negotiating PSA or Under Contract) in <span className="font-mono">Acquisitions/</span>; Closed deals live in <span className="font-mono">Portfolio/</span> and Dead deals in <span className="font-mono">Acquisitions/Dead/</span>.
        Every deal folder has <span className="font-mono">01 Models</span> through <span className="font-mono">09 Construction</span>. Models and LOIs move in from <span className="font-mono">Prelim Models/</span> and <span className="font-mono">LOIs/</span>.
        Duplicates are only removed when byte-for-byte identical to a copy that stays, and go to the OneDrive recycle bin. Uncheck anything you don&apos;t want.
      </div>

      {running && <p className="text-xs text-navy bg-navy/5 border border-navy/20 rounded px-3 py-2 mb-4">{running}</p>}
      {done && (
        <p className={`text-xs rounded px-3 py-2 mb-4 border ${failed.length ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-emerald-800 bg-emerald-50 border-emerald-200'}`}>
          Applied {results.size - failed.length} of {results.size} changes.{failed.length ? ` ${failed.length} failed; see the items marked below.` : ''} Click Re-check folders to confirm what&apos;s left.
        </p>
      )}
      {error && <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{error}</p>}
      {!plan && !error && <p className="text-sm text-gray-500">Reading your OneDrive folders… this takes up to half a minute.</p>}

      {plan && plan.groups.length === 0 && <p className="text-sm text-gray-700">Everything is already organized.</p>}

      <div className="space-y-4">
        {plan?.groups.map(g => {
          const allOn = g.ops.every(o => selected.has(o.id));
          return (
            <div key={g.folder} className="border border-gray-300 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between bg-gray-50 px-4 py-2 border-b border-gray-200">
                <div className="flex items-baseline gap-2 min-w-0">
                  <h2 className="text-sm font-semibold text-navy">{g.title}</h2>
                  <span className="text-[10px] uppercase tracking-wide text-gray-500">{g.stage || 'existing folder'}</span>
                  <span className="text-[11px] text-gray-500 font-mono truncate">{g.folder}</span>
                </div>
                {!done && <button onClick={() => toggleGroup(g.ops, !allOn)} className="text-[11px] text-navy hover:underline shrink-0">{allOn ? 'Uncheck all' : 'Check all'}</button>}
              </div>
              <div className="divide-y divide-gray-100">
                {g.ops.map(o => {
                  const r = results.get(o.id);
                  return (
                    <label key={o.id} className={`flex items-start gap-3 px-4 py-1.5 text-xs ${done ? '' : 'cursor-pointer hover:bg-gray-50'} ${!selected.has(o.id) ? 'opacity-50' : ''}`}>
                      <input type="checkbox" checked={selected.has(o.id)} onChange={() => toggle(o.id)} disabled={!!running || done} className="mt-0.5" />
                      <span className={`shrink-0 w-14 text-center text-[10px] font-semibold rounded px-1 py-0.5 ${KIND[o.kind].cls}`}>{KIND[o.kind].label}</span>
                      <span className="flex-1 text-gray-800 break-all">{describe(o, g.folder)}<span className="block text-[10px] text-gray-400">{o.reason}</span></span>
                      {r && <span className={`shrink-0 text-[11px] ${r.ok ? 'text-emerald-600' : 'text-red-600'}`} title={r.error}>{r.ok ? 'Done' : `Failed: ${r.error}`}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {plan && plan.notes.length > 0 && (
        <div className="mt-6 border border-gray-200 rounded-lg p-4">
          <h3 className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-semibold mb-2">Notes</h3>
          <ul className="list-disc pl-4 space-y-1 text-xs text-gray-700">{plan.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
