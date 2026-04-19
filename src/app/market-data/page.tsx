'use client';

import { useEffect, useState } from 'react';
import { fmtNum, fmtPct } from '@/lib/utils';

interface MarketData {
  id: number;
  snapshot_date: string;
  data: {
    rates_debt: {
      sofr: number;
      treasury_10y: number;
      agency_spread: number;
      bridge_spread: number;
      cmbs_spread: number;
      last_updated: string;
    };
    ios_fundamentals: {
      avg_rent_psf: number;
      vacancy_rate: number;
      absorption_sqft: number;
      new_supply_sqft: number;
      cap_rate_range: string;
      last_updated: string;
    };
    imports_freight: {
      teu_ytd: number;
      teu_yoy_change: number;
      avg_freight_rate: number;
      freight_yoy_change: number;
      trucking_index: number;
      last_updated: string;
    };
    port_volumes: {
      ports: { name: string; teu_monthly: number; yoy: number }[];
      last_updated: string;
    };
  };
}

type SubTab = 'rates' | 'ios' | 'freight' | 'ports';

export default function MarketDataPage() {
  const [data, setData] = useState<MarketData | null>(null);
  const [tab, setTab] = useState<SubTab>('rates');

  useEffect(() => {
    fetch('/api/market-data').then(r => r.json()).then(setData);
  }, []);

  const updateData = async () => {
    if (!data) return;
    // Simulate updating with slightly modified data
    const newData = JSON.parse(JSON.stringify(data.data));
    const today = new Date().toISOString().split('T')[0];
    newData.rates_debt.last_updated = today;
    newData.ios_fundamentals.last_updated = today;
    newData.imports_freight.last_updated = today;
    newData.port_volumes.last_updated = today;

    await fetch('/api/market-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ snapshot_date: today, data: newData }),
    });
    fetch('/api/market-data').then(r => r.json()).then(setData);
  };

  if (!data) return <div className="p-6"><div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" /></div>;

  const tabs: { key: SubTab; label: string }[] = [
    { key: 'rates', label: 'Rates & Debt' },
    { key: 'ios', label: 'IOS Fundamentals' },
    { key: 'freight', label: 'Imports & Freight' },
    { key: 'ports', label: 'Port Volumes' },
  ];

  return (
    <div className="p-6 max-w-6xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Market Data</h1>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">Last updated: {data.snapshot_date}</p>
        </div>
        <button onClick={updateData} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">
          Update Data
        </button>
      </div>

      {/* Sub-tabs */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-5">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key ? 'border-amber text-amber' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'rates' && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="SOFR" value={fmtPct(data.data.rates_debt.sofr, 2)} />
          <MetricCard label="10Y Treasury" value={fmtPct(data.data.rates_debt.treasury_10y, 2)} />
          <MetricCard label="Agency Spread" value={`${data.data.rates_debt.agency_spread} bps`} />
          <MetricCard label="Bridge Spread" value={`${data.data.rates_debt.bridge_spread} bps`} />
          <MetricCard label="CMBS Spread" value={`${data.data.rates_debt.cmbs_spread} bps`} />
          <MetricCard label="All-in Agency Rate" value={fmtPct(data.data.rates_debt.treasury_10y + data.data.rates_debt.agency_spread / 100, 2)} />
        </div>
      )}

      {tab === 'ios' && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="Avg Rent (PSF)" value={`$${fmtNum(data.data.ios_fundamentals.avg_rent_psf, 2)}`} />
          <MetricCard label="Vacancy Rate" value={fmtPct(data.data.ios_fundamentals.vacancy_rate)} />
          <MetricCard label="Absorption (SF)" value={fmtNum(data.data.ios_fundamentals.absorption_sqft, 0)} />
          <MetricCard label="New Supply (SF)" value={fmtNum(data.data.ios_fundamentals.new_supply_sqft, 0)} />
          <MetricCard label="Cap Rate Range" value={data.data.ios_fundamentals.cap_rate_range} />
          <MetricCard label="Net Absorption vs Supply" value={`${fmtNum(data.data.ios_fundamentals.absorption_sqft / data.data.ios_fundamentals.new_supply_sqft, 1)}x`} />
        </div>
      )}

      {tab === 'freight' && (
        <div className="grid grid-cols-2 gap-4">
          <MetricCard label="TEU YTD" value={fmtNum(data.data.imports_freight.teu_ytd, 0)} />
          <MetricCard label="TEU YoY Change" value={fmtPct(data.data.imports_freight.teu_yoy_change)} trend={data.data.imports_freight.teu_yoy_change} />
          <MetricCard label="Avg Freight Rate" value={`$${fmtNum(data.data.imports_freight.avg_freight_rate, 0)}`} />
          <MetricCard label="Freight YoY Change" value={fmtPct(data.data.imports_freight.freight_yoy_change)} trend={data.data.imports_freight.freight_yoy_change} />
          <MetricCard label="Trucking Index" value={fmtNum(data.data.imports_freight.trucking_index)} />
        </div>
      )}

      {tab === 'ports' && (
        <div className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-surface-dark">
                <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Port</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Monthly TEU</th>
                <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">YoY Change</th>
              </tr>
            </thead>
            <tbody>
              {data.data.port_volumes.ports.map(port => (
                <tr key={port.name} className="border-b border-gray-50 dark:border-gray-800">
                  <td className="py-2.5 px-4 font-medium text-gray-900 dark:text-gray-100">{port.name}</td>
                  <td className="py-2.5 px-4 text-right font-mono text-gray-700 dark:text-gray-300">{fmtNum(port.teu_monthly, 0)}</td>
                  <td className="py-2.5 px-4 text-right">
                    <span className={`font-mono ${port.yoy >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {port.yoy >= 0 ? '+' : ''}{fmtPct(port.yoy)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, trend }: { label: string; value: string; trend?: number }) {
  return (
    <div className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
      <p className={`text-xl font-mono font-semibold ${
        trend != null ? (trend >= 0 ? 'text-green-600' : 'text-red-600') : 'text-gray-900 dark:text-gray-100'
      }`}>
        {value}
      </p>
    </div>
  );
}
