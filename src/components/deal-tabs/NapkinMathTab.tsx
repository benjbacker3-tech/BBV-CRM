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
    <div className="space-y-6">
      {/* Inputs */}
      <section>
        <h4 className="section-label mb-2">Napkin Math Inputs</h4>
        <div className="grid grid-cols-2 gap-3">
          {inputFields.map(({ key, label, step }) => (
            <div key={key}>
              <label className="field-label">{label}</label>
              <input
                type="number"
                step={step || '1000'}
                value={inputs[key as keyof typeof inputs]}
                onChange={(e) => update(key as keyof typeof inputs, e.target.value)}
                className="field font-mono tabular-nums"
              />
            </div>
          ))}
        </div>
      </section>

      {/* Results */}
      <section className="space-y-4">
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
      </section>
    </div>
  );
}

function ResultSection({ title, items }: { title: string; items: { label: string; value: string; bold?: boolean; highlight?: boolean }[] }) {
  return (
    <div>
      <h5 className="section-label mb-2">{title}</h5>
      <div className="card overflow-hidden">
        <table className="table-clean">
          <tbody>
            {items.map(item => (
              <tr key={item.label} className={item.bold ? 'total-row' : 'row'}>
                <td className={item.bold ? '' : 'text-slate-500 dark:text-slate-400'}>{item.label}</td>
                <td className={`num ${item.highlight ? 'text-navy dark:text-blue-300' : ''}`}>{item.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
