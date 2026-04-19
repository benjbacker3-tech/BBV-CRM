'use client';

import { useState, useMemo } from 'react';
import { Deal, fmt, fmtPct } from '@/lib/utils';

export default function NapkinMathTab({ deal }: { deal: Deal }) {
  const [inputs, setInputs] = useState({
    purchasePrice: deal.asking_price || 0,
    capex: 500000,
    leasingCommissions: 50000,
    acquisitionFeePct: 1.5,
    closingCosts: 100000,
    ltcPct: 65,
    stabilizedNOI: 0,
    marketRentPSF: 5.25,
    acreage: deal.acreage || 0,
  });

  const calc = useMemo(() => {
    const acquisitionFee = inputs.purchasePrice * (inputs.acquisitionFeePct / 100);
    const totalCap = inputs.purchasePrice + inputs.capex + inputs.leasingCommissions + acquisitionFee + inputs.closingCosts;
    const loanAmount = totalCap * (inputs.ltcPct / 100);
    const equityCheck = totalCap - loanAmount;

    // Auto-calc NOI from rent and acreage if not manually set
    const sqft = inputs.acreage * 43560;
    const grossRev = inputs.marketRentPSF * sqft;
    const noi = inputs.stabilizedNOI || grossRev * 0.75; // 75% margin assumption

    const yocTotalCap = totalCap > 0 ? (noi / totalCap) * 100 : 0;
    const yocEquity = equityCheck > 0 ? (noi / equityCheck) * 100 : 0;

    // Cash-on-cash: assume 5.5% interest on loan
    const debtService = loanAmount * 0.055;
    const cashFlow = noi - debtService;
    const cashOnCash = equityCheck > 0 ? (cashFlow / equityCheck) * 100 : 0;

    return { acquisitionFee, totalCap, loanAmount, equityCheck, noi, yocTotalCap, yocEquity, cashOnCash, cashFlow, debtService };
  }, [inputs]);

  const update = (key: keyof typeof inputs, val: string) => {
    setInputs(prev => ({ ...prev, [key]: parseFloat(val) || 0 }));
  };

  const inputFields = [
    { key: 'purchasePrice', label: 'Purchase Price' },
    { key: 'capex', label: 'CapEx' },
    { key: 'leasingCommissions', label: 'Leasing Commissions' },
    { key: 'acquisitionFeePct', label: 'Acquisition Fee (%)', step: '0.1' },
    { key: 'closingCosts', label: 'Closing Costs' },
    { key: 'ltcPct', label: 'LTC (%)', step: '1' },
    { key: 'stabilizedNOI', label: 'Stabilized NOI (0 = auto)' },
    { key: 'marketRentPSF', label: 'Market Rent ($/SF)', step: '0.25' },
    { key: 'acreage', label: 'Acreage', step: '0.1' },
  ];

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Napkin Math</h4>

      {/* Inputs */}
      <div className="grid grid-cols-2 gap-2 mb-5">
        {inputFields.map(({ key, label, step }) => (
          <div key={key}>
            <label className="text-[10px] text-gray-500 dark:text-gray-400 block mb-0.5">{label}</label>
            <input
              type="number"
              step={step || '1000'}
              value={inputs[key as keyof typeof inputs]}
              onChange={(e) => update(key as keyof typeof inputs, e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm font-mono focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200"
            />
          </div>
        ))}
      </div>

      {/* Results */}
      <div className="space-y-4">
        <ResultSection title="Capitalization" items={[
          { label: 'Purchase Price', value: fmt(inputs.purchasePrice) },
          { label: 'CapEx', value: fmt(inputs.capex) },
          { label: 'Leasing Commissions', value: fmt(inputs.leasingCommissions) },
          { label: `Acquisition Fee (${inputs.acquisitionFeePct}%)`, value: fmt(calc.acquisitionFee) },
          { label: 'Closing Costs', value: fmt(inputs.closingCosts) },
          { label: 'Total Capitalization', value: fmt(calc.totalCap), bold: true },
        ]} />

        <ResultSection title="Capital Stack" items={[
          { label: `Loan Amount (${inputs.ltcPct}% LTC)`, value: fmt(calc.loanAmount) },
          { label: 'Equity Check', value: fmt(calc.equityCheck), bold: true, highlight: true },
        ]} />

        <ResultSection title="Returns" items={[
          { label: 'Stabilized NOI', value: fmt(calc.noi) },
          { label: 'Annual Debt Service (5.5%)', value: fmt(calc.debtService) },
          { label: 'Cash Flow', value: fmt(calc.cashFlow) },
          { label: 'YoC (Total Cap)', value: fmtPct(calc.yocTotalCap), bold: true },
          { label: 'YoC (Equity)', value: fmtPct(calc.yocEquity), bold: true },
          { label: 'Cash-on-Cash', value: fmtPct(calc.cashOnCash), bold: true, highlight: true },
        ]} />
      </div>
    </div>
  );
}

function ResultSection({ title, items }: { title: string; items: { label: string; value: string; bold?: boolean; highlight?: boolean }[] }) {
  return (
    <div className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
      <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">{title}</h5>
      <div className="space-y-1.5">
        {items.map(item => (
          <div key={item.label} className={`flex justify-between items-center ${item.bold ? 'pt-1.5 border-t border-gray-100 dark:border-gray-700' : ''}`}>
            <span className={`text-xs ${item.bold ? 'font-medium text-gray-800 dark:text-gray-200' : 'text-gray-500 dark:text-gray-400'}`}>{item.label}</span>
            <span className={`font-mono text-xs ${item.highlight ? 'text-amber font-bold' : item.bold ? 'font-semibold text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'}`}>
              {item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
