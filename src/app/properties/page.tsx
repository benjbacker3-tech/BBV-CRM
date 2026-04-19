'use client';

import { Fragment, useEffect, useState } from 'react';
import { Deal, Stage } from '@/lib/utils';

// Stages shown on this report (in order)
const REPORT_STAGES: Stage[] = ['Signed LOI', 'LOI Submitted', 'PSA Negotiation', 'Under Contract', 'Tracking'];

const SQFT_PER_ACRE = 43560;

// Formatters matching Excel output
const fmtInt = (n: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(n);
const fmtMoney = (n: number) => n == null || !isFinite(n) ? '—' : `$${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n))}`;
const fmtMoney2 = (n: number) => n == null || !isFinite(n) ? '—' : `$${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)}`;
const fmtPct1 = (n: number) => n == null || !isFinite(n) ? '—' : `${(n * 100).toFixed(1)}%`;
const fmtPct0 = (n: number) => n == null || !isFinite(n) ? '—' : `${Math.round(n * 100)}%`;
const fmtDec = (n: number, d = 2) => n == null || !isFinite(n) ? '—' : n.toFixed(d);

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

  if (deals === null) {
    return (
      <div className="p-6">
        <div className="skeleton h-7 w-40 mb-5" />
        <div className="skeleton h-96 w-full" />
      </div>
    );
  }

  // Only include deals that have been through the pipeline workflow (skip Closed/Dead for roster)
  const activeDeals = deals.filter(d => REPORT_STAGES.includes(d.stage as Stage));

  // Compute per-deal derived metrics
  const enriched = activeDeals.map((d) => {
    const landSF = (d.acreage || 0) * SQFT_PER_ACRE;
    const far = landSF > 0 ? (d.sf || 0) / landSF : 0;
    const plf = landSF > 0 ? (d.asking_price || 0) / landSF : 0;
    return { ...d, far, plf };
  });

  // Totals / weighted averages across all active deals
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
    <div className="p-6 max-w-[1600px]">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Properties</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Active acquisition pipeline roster</p>
        </div>
        <div className="flex items-center gap-3">
          {importResult && <span className="text-xs text-gray-500">{importResult}</span>}
          <button onClick={runImport} disabled={importing}
            className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50"
            title="Import the 8 deals from Acq Pipeline - 04 13 2026.xlsx">
            {importing ? 'Importing...' : 'Import Pipeline'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-xs font-mono">
          {/* Column group header tier */}
          <thead>
            <tr className="bg-navy text-white">
              <th colSpan={4} className="py-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase border-r border-navy-light text-center">&nbsp;</th>
              <th colSpan={4} className="py-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase border-r border-navy-light text-center">Specs</th>
              <th colSpan={2} className="py-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase border-r border-navy-light text-center">Basis</th>
              <th colSpan={2} className="py-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase border-r border-navy-light text-center">Yield-on-Cost</th>
              <th colSpan={1} className="py-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase border-r border-navy-light text-center">Total Equity</th>
              <th colSpan={3} className="py-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase border-r border-navy-light text-center">Transaction Terms</th>
              <th colSpan={1} className="py-1.5 px-2 text-[11px] font-semibold tracking-wider uppercase text-center">&nbsp;</th>
            </tr>
            {/* Column header tier */}
            <tr className="bg-gray-50 dark:bg-surface-dark text-gray-600 dark:text-gray-300 border-b-2 border-gray-200 dark:border-gray-700">
              <Th>No.</Th>
              <Th align="left">Address</Th>
              <Th align="left">City</Th>
              <Th align="left">Market</Th>
              <Th>SF</Th>
              <Th>Acres</Th>
              <Th>FAR</Th>
              <Th>Occ %</Th>
              <Th>Price</Th>
              <Th>$ PLF</Th>
              <Th>Initial</Th>
              <Th>Stab</Th>
              <Th>Req&apos;d</Th>
              <Th>DD</Th>
              <Th>Close</Th>
              <Th>Deposit</Th>
              <Th align="left">Notes</Th>
            </tr>
          </thead>

          <tbody>
            {REPORT_STAGES.filter(stage => enriched.some(d => d.stage === stage)).map(stage => {
              const stageDeals = enriched.filter(d => d.stage === stage);
              const startingNo = REPORT_STAGES.slice(0, REPORT_STAGES.indexOf(stage)).reduce((a, s) => a + enriched.filter(x => x.stage === s).length, 0);
              return (
                <Fragment key={stage}>
                  {/* Stage section header */}
                  <tr className="bg-amber/10 dark:bg-amber/20">
                    <td colSpan={17} className="py-1.5 px-2 text-xs font-semibold text-amber-dark dark:text-amber-light uppercase tracking-wider">
                      {stage}
                    </td>
                  </tr>
                  {stageDeals.map((d, idx) => (
                    <tr key={d.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <Td>{startingNo + idx + 1}</Td>
                      <Td align="left" font="sans" bold>{d.address}</Td>
                      <Td align="left" font="sans">{d.city}</Td>
                      <Td align="left" font="sans">{d.market}</Td>
                      <Td>{fmtInt(d.sf || 0)}</Td>
                      <Td>{fmtDec(d.acreage || 0, 2)}</Td>
                      <Td>{fmtDec(d.far, 2)}</Td>
                      <Td>{fmtPct0(d.occupancy || 0)}</Td>
                      <Td>{fmtMoney(d.asking_price || 0)}</Td>
                      <Td>{fmtMoney2(d.plf)}</Td>
                      <Td>{fmtPct1(d.yoc_initial || 0)}</Td>
                      <Td>{fmtPct1(d.yoc_target || 0)}</Td>
                      <Td>{fmtMoney(d.equity_required || 0)}</Td>
                      <Td>{d.dd_days || '—'}</Td>
                      <Td>{d.close_days || '—'}</Td>
                      <Td>{fmtMoney(d.deposit || 0)}</Td>
                      <Td align="left" font="sans" muted>{d.notes}</Td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}

            {/* Total / Weighted Avg row */}
            {enriched.length > 0 && (
              <tr className="bg-navy/5 dark:bg-navy-light/30 border-t-2 border-navy dark:border-amber font-semibold">
                <td colSpan={4} className="py-2 px-2 text-xs text-gray-800 dark:text-gray-100 text-left uppercase tracking-wider font-sans">Total / Weighted Avg.</td>
                <Td>{fmtInt(totals.sf)}</Td>
                <Td>{fmtDec(totals.acres, 2)}</Td>
                <Td>{fmtDec(wFar, 2)}</Td>
                <Td>{fmtPct0(wOcc)}</Td>
                <Td>{fmtMoney(totals.price)}</Td>
                <Td>{fmtMoney2(wPlf)}</Td>
                <Td>{fmtPct1(wInitial)}</Td>
                <Td>{fmtPct1(wStab)}</Td>
                <Td>{fmtMoney(totals.equity)}</Td>
                <Td>—</Td>
                <Td>—</Td>
                <Td>{fmtMoney(totals.deposit)}</Td>
                <Td>—</Td>
              </tr>
            )}

            {enriched.length === 0 && (
              <tr>
                <td colSpan={17} className="py-12 text-center text-sm text-gray-400 dark:text-gray-500 font-sans">
                  No active deals in the pipeline. Click <span className="font-medium">Import Pipeline</span> to load the 8 deals from the Excel file.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align = 'right' }: { children: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`py-1.5 px-2 text-[10px] font-semibold uppercase tracking-wider ${align === 'left' ? 'text-left' : 'text-right'}`}>
      {children}
    </th>
  );
}

function Td({ children, align = 'right', font, bold, muted }: {
  children: React.ReactNode;
  align?: 'left' | 'right';
  font?: 'sans' | 'mono';
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <td className={`py-1.5 px-2 text-xs ${align === 'left' ? 'text-left' : 'text-right'} ${font === 'sans' ? 'font-sans' : 'font-mono'} ${bold ? 'font-semibold text-gray-900 dark:text-gray-100' : muted ? 'text-gray-500 dark:text-gray-400' : 'text-gray-700 dark:text-gray-300'}`}>
      {children}
    </td>
  );
}
