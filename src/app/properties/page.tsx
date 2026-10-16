'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Deal, Stage, STAGES } from '@/lib/utils';
import { savedNapkin } from '@/lib/napkin';
import DealDetailPanel from '@/components/DealDetailPanel';

const SQFT_PER_ACRE = 43560;

// Section order in the report — matches the xlsx tab layout the user works from.
// "PSA" = executed PSA (Under Contract in our system).
// "Agreed to Terms" = handshake, PSA being drafted (Negotiating PSA in our system).
// "LOI Tracking" = LOIs out, no counter yet (LOI Submitted in our system).
// Tracking / Closed / Dead render as their own smaller sections at the bottom.
const REPORT_SECTIONS: { label: string; stages: Stage[]; subtotal: boolean; clusterWith?: string }[] = [
  { label: 'PSA',             stages: ['Under Contract'],  subtotal: false, clusterWith: 'Committed' },
  { label: 'Agreed to Terms', stages: ['Negotiating PSA'], subtotal: true,  clusterWith: 'Committed' },  // subtotal covers PSA + Agreed
  { label: 'LOI Tracking',    stages: ['LOI Submitted'],   subtotal: true },
  { label: 'Tracking',        stages: ['Tracking'],        subtotal: false },
];

// Cities → US state code (fallback when `state` isn't stored on the deal itself).
// Populated from the addresses we already have in the pipeline; adding a new
// city just falls through to no-state (—).
const CITY_STATE: Record<string, string> = {
  denver: 'CO', 'commerce city': 'CO', englewood: 'CO', 'north las vegas': 'NV',
  brighton: 'CO', henderson: 'CO', kent: 'WA', tacoma: 'WA', puyallup: 'WA',
  seattle: 'WA', meridian: 'ID', 'las vegas': 'NV', phoenix: 'AZ', madison: 'WI',
  houston: 'TX',
};
const inferState = (d: { state?: string | null; city?: string; market?: string }): string => {
  if (d.state) return d.state;
  const key = (d.city || '').trim().toLowerCase();
  return CITY_STATE[key] || '';
};

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dash = '—';
const fmtInt = (n: number) => (n == null || !isFinite(n) || n === 0 ? dash : nf0.format(n));
const fmtMoney = (n: number) => (n == null || !isFinite(n) || n === 0 ? dash : `$${nf0.format(Math.round(n))}`);
const fmtMoney2 = (n: number) => (n == null || !isFinite(n) || n === 0 ? dash : `$${nf2.format(n)}`);
const fmtPct1 = (n: number) => (n == null || !isFinite(n) || n === 0 ? dash : `${(n * 100).toFixed(1)}%`);
const fmtPct0 = (n: number) => (n == null || !isFinite(n) ? dash : `${Math.round(n * 100)}%`);
const fmtDec = (n: number, d = 2) => (n == null || !isFinite(n) || n === 0 ? dash : n.toFixed(d));
const fmtMult = (n: number | null | undefined) => (n == null || !isFinite(n) || n === 0 ? dash : `${n.toFixed(2)}x`);

export default function PropertiesPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null);

  const load = useCallback(() => fetch('/api/deals').then(r => r.json()).then(setDeals), []);

  useEffect(() => { load(); }, [load]);

  // Re-read every live deal's newest model from OneDrive (returns, basis, equity, fees).
  const syncModels = useCallback(async (quiet = false) => {
    setImporting(true);
    if (!quiet) setImportResult(null);
    try {
      const res = await fetch('/api/models/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) { if (!quiet) setImportResult(data.error || 'Model sync failed'); return; }
      const msg = `Models: ${data.updated} updated, ${data.unchanged} unchanged, ${data.noModel} without a model${data.priceMismatch ? `, ${data.priceMismatch} skipped (model price far from deal price)` : ''}${data.problems ? `, ${data.problems} unreadable` : ''}`;
      if (!quiet || data.updated) setImportResult(msg);
      if (data.updated) load();
    } finally {
      setImporting(false);
    }
  }, [load]);

  // Once OneDrive is connected, refresh from models in the background if the last sync is stale.
  useEffect(() => {
    if (!deals) return;
    const last = deals.map(d => d.model_synced_at).filter(Boolean).sort().pop();
    if (last && Date.now() - Date.parse(last) < 12 * 3600_000) return;
    fetch('/api/drive/status').then(r => r.json()).then(s => { if (s.ok) syncModels(true); }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals === null]);

  const exportXlsx = () => {
    window.location.href = '/api/properties/export';
  };

  const downloadTemplate = () => {
    window.location.href = '/api/properties/template';
  };

  const uploadModel = async (file: File) => {
    setUploadStatus(null);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/properties/import', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setUploadStatus({ kind: 'err', msg: data.error || `Upload failed (${res.status})` });
      } else {
        const verb = data.mode === 'created' ? 'Created' : 'Updated';
        setUploadStatus({ kind: 'ok', msg: `${verb} "${data.name}" from ${file.name}` });
        load();
      }
    } catch (e) {
      setUploadStatus({ kind: 'err', msg: e instanceof Error ? e.message : 'Upload failed' });
    }
    // Auto-clear status after 6s
    setTimeout(() => setUploadStatus(null), 6000);
  };

  // Page-level drag-and-drop: user can drop file anywhere on the page
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setIsDragging(true);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      // Only un-highlight when leaving the window entirely
      if (e.relatedTarget == null) setIsDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (!/\.(xlsx|xlsm)$/i.test(file.name)) {
        setUploadStatus({ kind: 'err', msg: `Not an Excel file: ${file.name}` });
        setTimeout(() => setUploadStatus(null), 6000);
        return;
      }
      await uploadModel(file);
    };
    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFilePicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadModel(file);
    e.target.value = '';
  };

  if (deals === null) {
    return (
      <div className="page">
        <div className="skeleton h-7 w-40 mb-6" />
        <div className="skeleton h-96 w-full rounded-xl" />
      </div>
    );
  }

  const REPORT_STAGES = REPORT_SECTIONS.flatMap(s => s.stages);
  const activeDeals = deals.filter(d => REPORT_STAGES.includes(d.stage as Stage));

  const enriched = activeDeals.map(d => {
    const landSF = (d.acreage || 0) * SQFT_PER_ACRE;
    const far = landSF > 0 ? (d.sf || 0) / landSF : 0;
    const plf = landSF > 0 ? (d.asking_price || 0) / landSF : 0;
    // Where the synced model is blank, fall back to the deal's saved Napkin Math (shown muted).
    const n = savedNapkin(d.napkin)?.out;
    const est = {
      irr: d.irr == null && n?.irr != null,
      em: d.em == null && n?.em != null,
      basis: !d.all_in_basis && !!n?.totalCap,
      equity: !d.equity_required && !!n?.equity,
    };
    return {
      ...d, far, plf, est,
      irr: est.irr ? n!.irr : d.irr,
      em: est.em ? n!.em : d.em,
      all_in_basis: est.basis ? n!.totalCap : d.all_in_basis,
      equity_required: est.equity ? n!.equity : d.equity_required,
    };
  });

  return (
    <>
      {/* Upload status toast */}
      {uploadStatus && (
        <div className={`fixed top-16 right-6 z-[80] px-4 py-3 rounded-xl shadow-lg border text-xs max-w-md animate-fade-in ${
          uploadStatus.kind === 'ok'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-300'
            : 'bg-red-50 border-red-200 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300'
        }`}>
          <div className="flex items-start gap-2">
            <span>{uploadStatus.kind === 'ok' ? '✓' : '⚠'}</span>
            <p className="flex-1">{uploadStatus.msg}</p>
            <button onClick={() => setUploadStatus(null)} className="text-current opacity-60 hover:opacity-100">×</button>
          </div>
        </div>
      )}

      {/* Drag-and-drop overlay */}
      {isDragging && (
        <div className="fixed inset-0 z-[90] bg-navy/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <div className="border-2 border-dashed border-white/40 rounded-xl px-12 py-10 text-center bg-white/5 max-w-lg">
            <svg className="w-12 h-12 mx-auto mb-3 text-white/80"fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-semibold text-white mb-1">Drop Excel model</p>
            <p className="text-xs text-slate-300">A deal model (IOS model Assumptions tab) updates that deal&apos;s IRR, EM, basis, equity and fees. A workbook with a &ldquo;Sandpiper Pipeline&rdquo; tab creates or updates the deal. Matched by address.</p>
          </div>
        </div>
      )}

      <div className={`page transition-all ${selectedDeal ? 'mr-[480px]' : ''}`}>
        {/* Report header */}
        <div className="page-header">
          <div>
            <p className="eyebrow">Sandpiper Capital LLC · Acquisition Pipeline</p>
            <h1 className="page-title">Pipeline</h1>
            <p className="page-sub">Active deals by stage, with specs, basis and returns from each deal&apos;s latest model. <span className="italic text-slate-400">Gray italic</span> = Napkin Math estimate, until a model syncs.</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {importResult && <span className="text-[11px] text-slate-500 dark:text-slate-400 mr-1 max-w-xs">{importResult}</span>}
            <label className="btn-secondary cursor-pointer" title="Upload a deal model (updates returns and fees) or a workbook with a 'Sandpiper Pipeline' tab">
              Upload Model
              <input type="file" accept=".xlsx,.xlsm" onChange={onFilePicked} className="hidden" />
            </label>
            <button
              onClick={downloadTemplate}
              className="btn-secondary"
              title="Download the Sandpiper Pipeline sync tab template"
            >
              Template
            </button>
            <button
              onClick={() => syncModels(false)}
              disabled={importing}
              title="Re-read IRR, EM, basis, equity and sponsor fees from each deal's newest model in OneDrive"
              className="btn-secondary"
            >
              {importing ? 'Syncing models…' : 'Sync models'}
            </button>
            <button
              onClick={exportXlsx}
              className="btn-secondary"
            >
              Export
            </button>
            <button
              onClick={() => setShowNewModal(true)}
              className="btn-primary"
            >
              + New Property
            </button>
          </div>
        </div>

        {/* Table — matches the xlsx pipeline tab layout (columns, groupings, section labels, per-cluster subtotals) */}
        <div className="card overflow-x-auto">
          <table className="table-clean">
            <thead>
              {/* Row 1 — column group band */}
              <tr>
                <th colSpan={4} className="!pb-1 !border-b-0 !text-slate-400 dark:!text-slate-500">Acquisition Pipeline</th>
                <th colSpan={4} className="!text-center !pb-1 !border-b-0 border-l border-slate-200 dark:border-slate-700 !text-slate-400 dark:!text-slate-500">Specs</th>
                <th colSpan={2} className="!text-center !pb-1 !border-b-0 border-l border-slate-200 dark:border-slate-700 !text-slate-400 dark:!text-slate-500">Basis</th>
                <th colSpan={2} className="!text-center !pb-1 !border-b-0 border-l border-slate-200 dark:border-slate-700 !text-slate-400 dark:!text-slate-500">Returns</th>
                <th colSpan={1} className="!text-center !pb-1 !border-b-0 border-l border-slate-200 dark:border-slate-700 !text-slate-400 dark:!text-slate-500">All-In</th>
                <th colSpan={1} className="!text-center !pb-1 !border-b-0 border-l border-slate-200 dark:border-slate-700 !text-slate-400 dark:!text-slate-500">Equity</th>
              </tr>
              {/* Row 2 — column labels */}
              <tr>
                <Th align="right">No.</Th>
                <Th align="left">Address</Th>
                <Th align="left">City</Th>
                <Th align="left">State</Th>
                <Th align="right">SF</Th>
                <Th align="right">Acres</Th>
                <Th align="right">FAR</Th>
                <Th align="right">Occ</Th>
                <Th align="right">Price</Th>
                <Th align="right">$ PLF</Th>
                <Th align="right">IRR</Th>
                <Th align="right">EM</Th>
                <Th align="right">Basis</Th>
                <Th align="right">Req&apos;d</Th>
              </tr>
            </thead>

            <tbody>
              {(() => {
                // Walk sections in order, emit header + rows + cluster subtotals where flagged.
                let no = 0;
                const clusterAccum: Record<string, EnrichedDeal[]> = {};
                const rows: React.ReactNode[] = [];

                for (const section of REPORT_SECTIONS) {
                  const sectionDeals = enriched.filter(d => section.stages.includes(d.stage as Stage));
                  if (sectionDeals.length === 0 && !section.subtotal) continue;

                  // Section header row
                  if (sectionDeals.length > 0) {
                    rows.push(
                      <tr key={`hdr-${section.label}`} className="group-row">
                        <td colSpan={14}>
                          <span className="inline-flex items-center gap-2">
                            {section.label}
                            <span className="count">{sectionDeals.length}</span>
                          </span>
                        </td>
                      </tr>
                    );

                    for (const d of sectionDeals) {
                      no++;
                      const state = inferState(d);
                      rows.push(
                        <tr
                          key={d.id}
                          onClick={() => setSelectedDeal(d)}
                          className={`row cursor-pointer ${
                            selectedDeal?.id === d.id ? 'bg-navy/5 dark:bg-blue-900/20' : ''
                          }`}
                        >
                          <Td align="right" muted>{no}</Td>
                          <Td align="left" font="sans" bold>{d.address}</Td>
                          <Td align="left" font="sans">{d.city}</Td>
                          <Td align="left" font="sans">{state || dash}</Td>
                          <Td align="right">{fmtInt(d.sf || 0)}</Td>
                          <Td align="right">{fmtDec(d.acreage || 0, 2)}</Td>
                          <Td align="right">{fmtDec(d.far, 2)}</Td>
                          <Td align="right">{fmtPct0(d.occupancy || 0)}</Td>
                          <Td align="right">{fmtMoney(d.asking_price || 0)}</Td>
                          <Td align="right">{fmtMoney2(d.plf)}</Td>
                          <Td align="right" est={d.est.irr}>{fmtPct1(d.irr ?? 0)}</Td>
                          <Td align="right" est={d.est.em}>{fmtMult(d.em)}</Td>
                          <Td align="right" est={d.est.basis}>{fmtMoney(d.all_in_basis ?? 0)}</Td>
                          <Td align="right" est={d.est.equity}>{fmtMoney(d.equity_required || 0)}</Td>
                        </tr>
                      );
                    }

                    // Add to cluster accumulator
                    if (section.clusterWith) {
                      clusterAccum[section.clusterWith] = [...(clusterAccum[section.clusterWith] || []), ...sectionDeals];
                    }
                  }

                  // Subtotal — either a cluster subtotal (across accumulated sections) or a section subtotal
                  if (section.subtotal) {
                    const subtotalDeals = section.clusterWith ? clusterAccum[section.clusterWith] : sectionDeals;
                    const label = section.clusterWith
                      ? `${section.clusterWith} · Total / Weighted Avg.`
                      : `${section.label} · Total / Weighted Avg.`;
                    if (subtotalDeals && subtotalDeals.length > 0) {
                      rows.push(<SubtotalRow key={`sub-${section.label}`} label={label} deals={subtotalDeals} />);
                    }
                    // Reset cluster after emitting its subtotal so we don't double-count later sections
                    if (section.clusterWith) delete clusterAccum[section.clusterWith];
                  }
                }

                if (rows.length === 0) {
                  rows.push(
                    <tr key="empty">
                      <td colSpan={14} className="!py-16 text-center text-[13px] !text-slate-400 dark:!text-slate-500">
                        No active deals. Click <span className="font-medium text-slate-600 dark:text-slate-300">+ New Property</span> to add one, or upload a workbook containing a <span className="font-medium text-slate-600 dark:text-slate-300">Sandpiper Pipeline</span> tab.
                      </td>
                    </tr>
                  );
                }

                return rows;
              })()}
            </tbody>
          </table>
        </div>

        <p className="mt-4 text-[10px] uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 text-right">
          Confidential · Prepared {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {selectedDeal && (
        <DealDetailPanel
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onUpdate={(updated) => { setSelectedDeal(updated); load(); }}
          onDelete={() => { setSelectedDeal(null); load(); }}
        />
      )}

      {showNewModal && (
        <NewPropertyModal
          onClose={() => setShowNewModal(false)}
          onCreated={() => { setShowNewModal(false); load(); }}
        />
      )}
    </>
  );
}

type EnrichedDeal = Deal & { far: number; plf: number; est: { irr: boolean; em: boolean; basis: boolean; equity: boolean } };

// Cluster subtotal row — weighted averages for ratio columns, sums for absolute
// columns. Weights: SF-weighted for occupancy; land-SF-weighted for FAR / $ PLF;
// equity-weighted for IRR and EM (deals with null IRR/EM are excluded from the
// weighted-avg denominator so an empty column doesn't drag the number to zero).
function SubtotalRow({ label, deals }: { label: string; deals: EnrichedDeal[] }) {
  const totalSF = deals.reduce((s, d) => s + (d.sf || 0), 0);
  const totalAcres = deals.reduce((s, d) => s + (d.acreage || 0), 0);
  const totalLandSF = totalAcres * SQFT_PER_ACRE;
  const totalPrice = deals.reduce((s, d) => s + (d.asking_price || 0), 0);
  const totalEquity = deals.reduce((s, d) => s + (d.equity_required || 0), 0);
  const totalAllIn = deals.reduce((s, d) => s + (d.all_in_basis || 0), 0);

  const wFar = totalLandSF > 0 ? totalSF / totalLandSF : 0;
  const wOcc = totalSF > 0
    ? deals.reduce((s, d) => s + (d.occupancy || 0) * (d.sf || 0), 0) / totalSF
    : deals.length > 0 ? deals.reduce((s, d) => s + (d.occupancy || 0), 0) / deals.length : 0;
  const wPlf = totalLandSF > 0 ? totalPrice / totalLandSF : 0;

  const irrDeals = deals.filter(d => d.irr != null && d.equity_required);
  const irrEquity = irrDeals.reduce((s, d) => s + (d.equity_required || 0), 0);
  const wIrr = irrEquity > 0 ? irrDeals.reduce((s, d) => s + (d.irr || 0) * (d.equity_required || 0), 0) / irrEquity : 0;

  const emDeals = deals.filter(d => d.em != null && d.equity_required);
  const emEquity = emDeals.reduce((s, d) => s + (d.equity_required || 0), 0);
  const wEm = emEquity > 0 ? emDeals.reduce((s, d) => s + (d.em || 0) * (d.equity_required || 0), 0) / emEquity : 0;

  return (
    <>
      <tr className="total-row">
        <td colSpan={4} className="whitespace-nowrap">{label}</td>
        <Td align="right" bold mono>{fmtInt(totalSF)}</Td>
        <Td align="right" bold mono>{fmtDec(totalAcres, 2)}</Td>
        <Td align="right" bold mono>{fmtDec(wFar, 2)}</Td>
        <Td align="right" bold mono>{fmtPct0(wOcc)}</Td>
        <Td align="right" bold mono>{fmtMoney(totalPrice)}</Td>
        <Td align="right" bold mono>{fmtMoney2(wPlf)}</Td>
        <Td align="right" bold mono>{wIrr > 0 ? fmtPct1(wIrr) : dash}</Td>
        <Td align="right" bold mono>{wEm > 0 ? fmtMult(wEm) : dash}</Td>
        <Td align="right" bold mono>{fmtMoney(totalAllIn)}</Td>
        <Td align="right" bold mono>{fmtMoney(totalEquity)}</Td>
      </tr>
      <tr><td colSpan={14} className="!p-0 h-3 !border-b-0 !bg-transparent" /></tr>
    </>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={align === 'right' ? '!text-right' : undefined}>
      {children}
    </th>
  );
}

function Td({ children, align = 'right', font, bold, muted, mono, est }: {
  children: React.ReactNode;
  est?: boolean;          // a Napkin Math estimate, not from the deal's model
  align?: 'left' | 'right';
  font?: 'sans' | 'mono';
  bold?: boolean;
  muted?: boolean;
  mono?: boolean;
}) {
  const textClass = bold
    ? '!text-slate-900 dark:!text-slate-100 font-semibold'
    : muted
      ? '!text-slate-400 dark:!text-slate-500'
      : est
        ? '!text-slate-400 italic'
        : '';
  const useMono = mono || font !== 'sans';
  const alignClass = useMono && align === 'right' ? 'num' : align === 'left' ? 'text-left' : 'text-right';
  const fontClass = useMono ? 'font-mono tabular-nums' : '';
  return (
    <td className={`whitespace-nowrap ${alignClass} ${fontClass} ${textClass}`} title={est ? 'Napkin Math estimate (no model yet)' : undefined}>
      {children}
    </td>
  );
}

// -----------------------------------------------------------------------------
// New Property modal — full field set, mirroring the Excel pipeline format
// -----------------------------------------------------------------------------

interface NewPropertyFormState {
  name: string;
  address: string;
  city: string;
  market: string;
  sf: string;
  acreage: string;
  occupancy: string;        // percent, e.g. "100"
  asking_price: string;
  yoc_initial: string;      // percent, e.g. "8.5"
  yoc_target: string;       // percent
  equity_required: string;
  stage: Stage;
  dd_days: string;
  close_days: string;
  deposit: string;
  notes: string;
}

const emptyForm: NewPropertyFormState = {
  name: '', address: '', city: '', market: '',
  sf: '', acreage: '', occupancy: '',
  asking_price: '', yoc_initial: '', yoc_target: '', equity_required: '',
  stage: 'Tracking', dd_days: '', close_days: '', deposit: '', notes: '',
};

function NewPropertyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState<NewPropertyFormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const update = <K extends keyof NewPropertyFormState>(key: K, value: NewPropertyFormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const submit = async () => {
    // Use the address as the deal name if name isn't provided (matches Excel style)
    const name = form.name.trim() || form.address.trim();
    if (!name) return;

    setSaving(true);
    const toNum = (s: string) => (s === '' ? 0 : parseFloat(s));
    const pct = (s: string) => (s === '' ? 0 : parseFloat(s) / 100);
    try {
      await fetch('/api/deals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          address: form.address,
          city: form.city,
          market: form.market,
          submarket: null,
          sf: toNum(form.sf),
          acreage: toNum(form.acreage),
          occupancy: pct(form.occupancy),
          asking_price: toNum(form.asking_price),
          yoc_initial: pct(form.yoc_initial),
          yoc_target: pct(form.yoc_target),
          equity_required: toNum(form.equity_required),
          zoning: null,
          ios_eligible: 1,
          stage: form.stage,
          source: null,
          dd_expiry: null,
          dd_days: parseInt(form.dd_days) || 0,
          close_days: parseInt(form.close_days) || 0,
          deposit: toNum(form.deposit),
          notes: form.notes || null,
        }),
      });
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]" />
      <div
        className="card relative shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="card-header !px-6 !py-4 sticky top-0 bg-white dark:bg-slate-900 z-10">
          <div>
            <p className="eyebrow">Acquisition Pipeline</p>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">New Property</h2>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1.5 text-slate-400">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Property */}
          <Section title="Property">
            <Field label="Address *" colSpan={3}>
              <input autoFocus value={form.address} onChange={e => update('address', e.target.value)} placeholder="6371 Nesbitt" className={inputCls} />
            </Field>
            <Field label="City">
              <input value={form.city} onChange={e => update('city', e.target.value)} placeholder="Madison" className={inputCls} />
            </Field>
            <Field label="Market">
              <input value={form.market} onChange={e => update('market', e.target.value)} placeholder="Wisconsin" className={inputCls} />
            </Field>
            <Field label="Stage">
              <select value={form.stage} onChange={e => update('stage', e.target.value as Stage)} className={inputCls}>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </Section>

          {/* Specs */}
          <Section title="Specs">
            <Field label="Building SF">
              <input type="number" value={form.sf} onChange={e => update('sf', e.target.value)} placeholder="50,000" className={inputCls} />
            </Field>
            <Field label="Acres">
              <input type="number" step="0.01" value={form.acreage} onChange={e => update('acreage', e.target.value)} placeholder="12.22" className={inputCls} />
            </Field>
            <Field label="Occupancy (%)">
              <input type="number" value={form.occupancy} onChange={e => update('occupancy', e.target.value)} placeholder="100" className={inputCls} />
            </Field>
          </Section>

          {/* Basis & Returns */}
          <Section title="Basis & Returns">
            <Field label="Asking Price ($)">
              <input type="number" step="10000" value={form.asking_price} onChange={e => update('asking_price', e.target.value)} placeholder="3,600,000" className={inputCls} />
            </Field>
            <Field label="Initial YoC (%)">
              <input type="number" step="0.1" value={form.yoc_initial} onChange={e => update('yoc_initial', e.target.value)} placeholder="6.5" className={inputCls} />
            </Field>
            <Field label="Stab YoC (%)">
              <input type="number" step="0.1" value={form.yoc_target} onChange={e => update('yoc_target', e.target.value)} placeholder="10.7" className={inputCls} />
            </Field>
            <Field label="Equity Required ($)" colSpan={3}>
              <input type="number" step="10000" value={form.equity_required} onChange={e => update('equity_required', e.target.value)} placeholder="2,343,106" className={inputCls} />
            </Field>
          </Section>

          {/* Transaction Terms */}
          <Section title="Transaction Terms">
            <Field label="DD (days)">
              <input type="number" value={form.dd_days} onChange={e => update('dd_days', e.target.value)} placeholder="60" className={inputCls} />
            </Field>
            <Field label="Close (days)">
              <input type="number" value={form.close_days} onChange={e => update('close_days', e.target.value)} placeholder="30" className={inputCls} />
            </Field>
            <Field label="Deposit ($)">
              <input type="number" step="1000" value={form.deposit} onChange={e => update('deposit', e.target.value)} placeholder="50,000" className={inputCls} />
            </Field>
          </Section>

          {/* Notes */}
          <Section title="Notes">
            <div className="col-span-3">
              <textarea rows={3} value={form.notes} onChange={e => update('notes', e.target.value)} className={inputCls} placeholder="Larger site with two shops and multiple access points…" />
            </div>
          </Section>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 sticky bottom-0 bg-white dark:bg-slate-900">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !form.address.trim()} className="btn-primary">
            {saving ? 'Saving…' : 'Create Property'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "field";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="section-label mb-3 pb-1.5 border-b border-slate-100 dark:border-slate-800">{title}</h3>
      <div className="grid grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children, colSpan = 1 }: { label: string; children: React.ReactNode; colSpan?: 1 | 2 | 3 }) {
  const colSpanClass = colSpan === 3 ? 'col-span-3' : colSpan === 2 ? 'col-span-2' : 'col-span-1';
  return (
    <div className={colSpanClass}>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}
