'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { Deal, Stage, STAGES } from '@/lib/utils';
import DealDetailPanel from '@/components/DealDetailPanel';

const REPORT_STAGES: Stage[] = ['Negotiating PSA', 'LOI Submitted', 'Under Contract', 'Tracking'];
const SQFT_PER_ACRE = 43560;

const nf0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const dash = '—';
const fmtInt = (n: number) => (n == null || !isFinite(n) || n === 0 ? dash : nf0.format(n));
const fmtMoney = (n: number) => (n == null || !isFinite(n) || n === 0 ? dash : `$${nf0.format(Math.round(n))}`);
const fmtMoney2 = (n: number) => (n == null || !isFinite(n) || n === 0 ? dash : `$${nf2.format(n)}`);
const fmtPct1 = (n: number) => (n == null || !isFinite(n) || n === 0 ? dash : `${(n * 100).toFixed(1)}%`);
const fmtPct0 = (n: number) => (n == null || !isFinite(n) ? dash : `${Math.round(n * 100)}%`);
const fmtDec = (n: number, d = 2) => (n == null || !isFinite(n) || n === 0 ? dash : n.toFixed(d));

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

  const runImport = async () => {
    setImporting(true);
    setImportResult(null);
    try {
      const res = await fetch('/api/seed-pipeline', { method: 'POST' });
      const data = await res.json();
      setImportResult(`Imported ${data.inserted?.length || 0}, skipped ${data.skipped?.length || 0}`);
      load();
    } finally {
      setImporting(false);
    }
  };

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
      <div className="p-8">
        <div className="skeleton h-7 w-40 mb-5" />
        <div className="skeleton h-96 w-full" />
      </div>
    );
  }

  const activeDeals = deals.filter(d => REPORT_STAGES.includes(d.stage as Stage));

  const enriched = activeDeals.map(d => {
    const landSF = (d.acreage || 0) * SQFT_PER_ACRE;
    const far = landSF > 0 ? (d.sf || 0) / landSF : 0;
    const plf = landSF > 0 ? (d.asking_price || 0) / landSF : 0;
    return { ...d, far, plf };
  });

  const totals = {
    sf: enriched.reduce((s, d) => s + (d.sf || 0), 0),
    acres: enriched.reduce((s, d) => s + (d.acreage || 0), 0),
    price: enriched.reduce((s, d) => s + (d.asking_price || 0), 0),
    equity: enriched.reduce((s, d) => s + (d.equity_required || 0), 0),
    deposit: enriched.reduce((s, d) => s + (d.deposit || 0), 0),
  };
  const totalLandSF = totals.acres * SQFT_PER_ACRE;
  const wFar = totalLandSF > 0 ? totals.sf / totalLandSF : 0;
  const wOcc = enriched.length > 0 ? enriched.reduce((s, d) => s + (d.occupancy || 0), 0) / enriched.length : 0;
  const wPlf = totalLandSF > 0 ? totals.price / totalLandSF : 0;
  const wInitial = totals.price > 0 ? enriched.reduce((s, d) => s + (d.yoc_initial || 0) * (d.asking_price || 0), 0) / totals.price : 0;
  const wStab = totals.price > 0 ? enriched.reduce((s, d) => s + (d.yoc_target || 0) * (d.asking_price || 0), 0) / totals.price : 0;

  return (
    <>
      {/* Upload status toast */}
      {uploadStatus && (
        <div className={`fixed top-16 right-6 z-[80] px-4 py-3 rounded-lg shadow-lg border text-sm max-w-md animate-fade-in ${
          uploadStatus.kind === 'ok'
            ? 'bg-green-50 border-green-200 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-300'
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
          <div className="border-2 border-dashed border-amber rounded-xl px-12 py-10 text-center bg-white/5">
            <svg className="w-12 h-12 mx-auto mb-3 text-amber" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <p className="text-lg font-semibold text-white mb-1">Drop Excel model</p>
            <p className="text-xs text-slate-300">Must contain a &ldquo;MCI Pipeline&rdquo; tab. Matches by address — updates if exists, creates if new.</p>
          </div>
        </div>
      )}

      <div className={`px-8 py-8 max-w-[1500px] transition-all ${selectedDeal ? 'mr-[480px]' : ''}`}>
        {/* Report header */}
        <div className="flex items-end justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 mb-1">Mission Critical Industrial · Acquisition Pipeline</p>
            <h1 className="text-xl font-medium text-gray-900 dark:text-gray-100 tracking-tight">Properties</h1>
          </div>
          <div className="flex items-center gap-2">
            {importResult && <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">{importResult}</span>}
            <button
              onClick={() => setShowNewModal(true)}
              className="px-3 py-1.5 text-xs text-white bg-amber hover:bg-amber-dark rounded"
            >
              + New Property
            </button>
            <label className="px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer" title="Upload a deal model containing a 'MCI Pipeline' tab">
              Upload Model
              <input type="file" accept=".xlsx,.xlsm" onChange={onFilePicked} className="hidden" />
            </label>
            <button
              onClick={downloadTemplate}
              className="px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800"
              title="Download the MCI Pipeline sync tab template"
            >
              Template
            </button>
            <button
              onClick={runImport}
              disabled={importing}
              className="px-3 py-1.5 text-xs text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              {importing ? 'Importing…' : 'Import Pipeline'}
            </button>
            <button
              onClick={exportXlsx}
              className="px-3 py-1.5 text-xs text-white bg-navy hover:bg-navy-light rounded"
            >
              Export
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="text-gray-500 dark:text-gray-400">
                <th colSpan={4} className="py-1.5 px-2"></th>
                <th colSpan={4} className="py-1.5 px-2 text-center text-[9px] uppercase tracking-[0.15em] font-semibold border-b border-gray-300 dark:border-gray-600">Specs</th>
                <th colSpan={2} className="py-1.5 px-2 text-center text-[9px] uppercase tracking-[0.15em] font-semibold border-b border-gray-300 dark:border-gray-600">Basis</th>
                <th colSpan={2} className="py-1.5 px-2 text-center text-[9px] uppercase tracking-[0.15em] font-semibold border-b border-gray-300 dark:border-gray-600">Yield-on-Cost</th>
                <th colSpan={1} className="py-1.5 px-2 text-center text-[9px] uppercase tracking-[0.15em] font-semibold border-b border-gray-300 dark:border-gray-600">Equity</th>
                <th colSpan={3} className="py-1.5 px-2 text-center text-[9px] uppercase tracking-[0.15em] font-semibold border-b border-gray-300 dark:border-gray-600">Transaction Terms</th>
                <th colSpan={1} className="py-1.5 px-2"></th>
              </tr>
              <tr className="text-gray-600 dark:text-gray-300 border-b border-gray-300 dark:border-gray-600">
                <Th align="right">No.</Th>
                <Th align="left">Address</Th>
                <Th align="left">City</Th>
                <Th align="left">Market</Th>
                <Th align="right">SF</Th>
                <Th align="right">Acres</Th>
                <Th align="right">FAR</Th>
                <Th align="right">Occ</Th>
                <Th align="right">Price</Th>
                <Th align="right">$ / LSF</Th>
                <Th align="right">Initial</Th>
                <Th align="right">Stab</Th>
                <Th align="right">Req&apos;d</Th>
                <Th align="right">DD</Th>
                <Th align="right">Close</Th>
                <Th align="right">Deposit</Th>
                <Th align="left">Notes</Th>
              </tr>
            </thead>

            <tbody>
              {REPORT_STAGES.filter(stage => enriched.some(d => d.stage === stage)).map(stage => {
                const stageDeals = enriched.filter(d => d.stage === stage);
                const startingNo = REPORT_STAGES.slice(0, REPORT_STAGES.indexOf(stage)).reduce((a, s) => a + enriched.filter(x => x.stage === s).length, 0);
                return (
                  <Fragment key={stage}>
                    <tr>
                      <td colSpan={17} className="pt-5 pb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-gray-700 dark:text-gray-200">{stage}</span>
                          <span className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">({stageDeals.length})</span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={17} className="border-t border-gray-300 dark:border-gray-600 p-0" />
                    </tr>
                    {stageDeals.map((d, idx) => (
                      <tr
                        key={d.id}
                        onClick={() => setSelectedDeal(d)}
                        className={`border-b border-gray-100 dark:border-gray-800 cursor-pointer transition-colors ${
                          selectedDeal?.id === d.id ? 'bg-amber/5 dark:bg-amber/10' : 'hover:bg-gray-50/60 dark:hover:bg-gray-800/30'
                        }`}
                      >
                        <Td align="right" muted>{startingNo + idx + 1}</Td>
                        <Td align="left" font="sans" bold>{d.address}</Td>
                        <Td align="left" font="sans">{d.city}</Td>
                        <Td align="left" font="sans">{d.market}</Td>
                        <Td align="right">{fmtInt(d.sf || 0)}</Td>
                        <Td align="right">{fmtDec(d.acreage || 0, 2)}</Td>
                        <Td align="right">{fmtDec(d.far, 2)}</Td>
                        <Td align="right">{fmtPct0(d.occupancy || 0)}</Td>
                        <Td align="right">{fmtMoney(d.asking_price || 0)}</Td>
                        <Td align="right">{fmtMoney2(d.plf)}</Td>
                        <Td align="right">{fmtPct1(d.yoc_initial || 0)}</Td>
                        <Td align="right">{fmtPct1(d.yoc_target || 0)}</Td>
                        <Td align="right">{fmtMoney(d.equity_required || 0)}</Td>
                        <Td align="right">{d.dd_days || dash}</Td>
                        <Td align="right">{d.close_days || dash}</Td>
                        <Td align="right">{fmtMoney(d.deposit || 0)}</Td>
                        <Td align="left" font="sans" muted>{d.notes}</Td>
                      </tr>
                    ))}
                  </Fragment>
                );
              })}

              {enriched.length > 0 && (
                <>
                  <tr><td colSpan={17} className="pt-3 p-0" /></tr>
                  <tr className="border-t-2 border-b border-double border-gray-700 dark:border-gray-400">
                    <td colSpan={4} className="py-2 px-2 text-[11px] font-sans font-semibold text-gray-900 dark:text-gray-100 text-left">
                      Total / Weighted Avg.
                    </td>
                    <Td align="right" bold mono>{fmtInt(totals.sf)}</Td>
                    <Td align="right" bold mono>{fmtDec(totals.acres, 2)}</Td>
                    <Td align="right" bold mono>{fmtDec(wFar, 2)}</Td>
                    <Td align="right" bold mono>{fmtPct0(wOcc)}</Td>
                    <Td align="right" bold mono>{fmtMoney(totals.price)}</Td>
                    <Td align="right" bold mono>{fmtMoney2(wPlf)}</Td>
                    <Td align="right" bold mono>{fmtPct1(wInitial)}</Td>
                    <Td align="right" bold mono>{fmtPct1(wStab)}</Td>
                    <Td align="right" bold mono>{fmtMoney(totals.equity)}</Td>
                    <Td align="right" muted>{dash}</Td>
                    <Td align="right" muted>{dash}</Td>
                    <Td align="right" bold mono>{fmtMoney(totals.deposit)}</Td>
                    <Td align="right" muted>{dash}</Td>
                  </tr>
                </>
              )}

              {enriched.length === 0 && (
                <tr>
                  <td colSpan={17} className="py-16 text-center text-sm text-gray-400 dark:text-gray-500 font-sans">
                    No active deals. Click <span className="font-medium text-gray-600 dark:text-gray-300">+ New Property</span> to add one, or <span className="font-medium text-gray-600 dark:text-gray-300">Import Pipeline</span> to load the 8 deals from the Excel file.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500 text-right">
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

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`py-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.08em] ${align === 'left' ? 'text-left' : 'text-right'}`}>
      {children}
    </th>
  );
}

function Td({ children, align = 'right', font, bold, muted, mono }: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  font?: 'sans' | 'mono';
  bold?: boolean;
  muted?: boolean;
  mono?: boolean;
}) {
  const textClass = bold
    ? 'text-gray-900 dark:text-gray-100 font-semibold'
    : muted
      ? 'text-gray-500 dark:text-gray-500'
      : 'text-gray-800 dark:text-gray-200';
  const useMono = mono || font !== 'sans';
  const fontClass = useMono ? 'font-mono tabular-nums' : 'font-sans';
  return (
    <td className={`py-1.5 px-2 text-[11px] whitespace-nowrap ${align === 'left' ? 'text-left' : 'text-right'} ${fontClass} ${textClass}`}>
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
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div
        className="relative bg-white dark:bg-surface rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-2xl max-h-[90vh] overflow-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-surface z-10">
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">Acquisition Pipeline</p>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">New Property</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1">
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
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex items-center justify-end gap-2 sticky bottom-0 bg-white dark:bg-surface">
          <button onClick={onClose} className="px-4 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !form.address.trim()} className="px-4 py-1.5 text-sm text-white bg-amber hover:bg-amber-dark rounded disabled:opacity-50">
            {saving ? 'Saving…' : 'Create Property'}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls = "w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[10px] uppercase tracking-[0.15em] text-gray-500 dark:text-gray-400 font-semibold mb-2 pb-1 border-b border-gray-100 dark:border-gray-700">{title}</h3>
      <div className="grid grid-cols-3 gap-3">{children}</div>
    </div>
  );
}

function Field({ label, children, colSpan = 1 }: { label: string; children: React.ReactNode; colSpan?: 1 | 2 | 3 }) {
  const colSpanClass = colSpan === 3 ? 'col-span-3' : colSpan === 2 ? 'col-span-2' : 'col-span-1';
  return (
    <div className={colSpanClass}>
      <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}
