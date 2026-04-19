'use client';

import { Fragment, useEffect, useState } from 'react';
import { Deal, Stage } from '@/lib/utils';

const REPORT_STAGES: Stage[] = ['Signed LOI', 'LOI Submitted', 'PSA Negotiation', 'Under Contract', 'Tracking'];
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

  const load = () => fetch('/api/deals').then(r => r.json()).then(setDeals);

  useEffect(() => { load(); }, []);

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
    <div className="px-8 py-8 max-w-[1500px]">
      {/* Report header */}
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-gray-200 dark:border-gray-800">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500 mb-1">Sandpiper Partners · Acquisition Pipeline</p>
          <h1 className="text-xl font-medium text-gray-900 dark:text-gray-100 tracking-tight">Properties</h1>
        </div>
        <div className="flex items-center gap-2">
          {importResult && <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">{importResult}</span>}
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
            Export to Excel
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            {/* Tier 1: Group labels */}
            <tr className="text-gray-500 dark:text-gray-400">
              <th colSpan={4} className="py-1.5 px-2 text-left font-normal"></th>
              <th colSpan={4} className="py-1.5 px-2 text-center text-[9px] uppercase tracking-[0.15em] font-semibold border-b border-gray-300 dark:border-gray-600">Specs</th>
              <th colSpan={2} className="py-1.5 px-2 text-center text-[9px] uppercase tracking-[0.15em] font-semibold border-b border-gray-300 dark:border-gray-600">Basis</th>
              <th colSpan={2} className="py-1.5 px-2 text-center text-[9px] uppercase tracking-[0.15em] font-semibold border-b border-gray-300 dark:border-gray-600">Yield-on-Cost</th>
              <th colSpan={1} className="py-1.5 px-2 text-center text-[9px] uppercase tracking-[0.15em] font-semibold border-b border-gray-300 dark:border-gray-600">Equity</th>
              <th colSpan={3} className="py-1.5 px-2 text-center text-[9px] uppercase tracking-[0.15em] font-semibold border-b border-gray-300 dark:border-gray-600">Transaction Terms</th>
              <th colSpan={1} className="py-1.5 px-2"></th>
            </tr>
            {/* Tier 2: Column headers */}
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
                  {/* Stage section label — clean banking style: thin rule + small caps */}
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
                    <tr key={d.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/30">
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

            {/* Total / Weighted Avg row */}
            {enriched.length > 0 && (
              <>
                <tr>
                  <td colSpan={17} className="pt-3 p-0" />
                </tr>
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
                  No active deals in the pipeline. Click <span className="font-medium text-gray-600 dark:text-gray-300">Import Pipeline</span> to load the 8 deals from the Excel file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer note */}
      <p className="mt-5 pt-3 border-t border-gray-100 dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500 text-right">
        Confidential · Prepared {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
    </div>
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
