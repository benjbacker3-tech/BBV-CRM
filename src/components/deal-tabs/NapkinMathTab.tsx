'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Deal, fmt, fmtPct } from '@/lib/utils';
import { NAPKIN_DEFAULTS, NapkinInputs, napkinCalc, savedNapkin } from '@/lib/napkin';

// Quick screening underwrite. Saves itself on the deal as you type; the Pipeline shows its
// IRR, multiple, basis and equity (muted) until a synced Excel model replaces them.
export default function NapkinMathTab({ deal, onUpdate }: { deal: Deal; onUpdate?: (deal: Deal) => void }) {
  const saved = savedNapkin(deal.napkin);
  const [inputs, setInputs] = useState<NapkinInputs>(() => ({
    ...NAPKIN_DEFAULTS,
    purchasePrice: deal.asking_price || 0,
    acreage: deal.acreage || 0,
    ...saved?.inputs,
  }));
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>(saved ? 'saved' : 'idle');
  const [savedAt, setSavedAt] = useState<string | null>(saved?.saved_at ?? null);
  const calc = useMemo(() => napkinCalc(inputs), [inputs]);
  const dirty = useRef(false);

  // Save 800ms after the last change.
  useEffect(() => {
    if (!dirty.current) return;
    setStatus('saving');
    const t = setTimeout(async () => {
      const at = new Date().toISOString();
      try {
        const res = await fetch(`/api/deals/${deal.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ napkin: JSON.stringify({ v: 1, inputs, out: calc, saved_at: at }) }),
        });
        if (!res.ok) throw new Error(String(res.status));
        setStatus('saved');
        setSavedAt(at);
        onUpdate?.(await res.json());
      } catch {
        setStatus('error');
      }
    }, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputs]);

  const update = (key: keyof NapkinInputs, val: string) => {
    dirty.current = true;
    setInputs(prev => ({ ...prev, [key]: parseFloat(val) || 0 }));
  };

  const groups: { title: string; fields: { key: keyof NapkinInputs; label: string; step?: string }[] }[] = [
    { title: 'Purchase & costs', fields: [
      { key: 'purchasePrice', label: 'Purchase Price' },
      { key: 'capex', label: 'CapEx' },
      { key: 'leasingCommissions', label: 'Leasing Commissions' },
      { key: 'acquisitionFeePct', label: 'Acquisition Fee (%)', step: '0.1' },
      { key: 'closingCosts', label: 'Closing Costs' },
    ] },
    { title: 'Income', fields: [
      { key: 'stabilizedNOI', label: 'Stabilized NOI (0 = auto)' },
      { key: 'marketRentPSF', label: 'Market Rent ($/SF land/yr)', step: '0.25' },
      { key: 'acreage', label: 'Acreage', step: '0.1' },
      { key: 'noiGrowthPct', label: 'NOI Growth (%/yr)', step: '0.5' },
    ] },
    { title: 'Debt & exit', fields: [
      { key: 'ltcPct', label: 'LTC (%)', step: '1' },
      { key: 'interestPct', label: 'Interest Rate (%)', step: '0.125' },
      { key: 'holdYears', label: 'Hold (years)', step: '1' },
      { key: 'exitCapPct', label: 'Exit Cap (%)', step: '0.25' },
      { key: 'saleCostPct', label: 'Sale Costs (%)', step: '0.5' },
    ] },
  ];

  const note = status === 'saving' ? 'Saving…'
    : status === 'error' ? 'Couldn’t save. Check your connection; changes will retry on the next edit.'
    : savedAt ? `Saved ${new Date(savedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · shows on the Pipeline${deal.model_synced_at ? ' only where the model is blank' : ''}`
    : 'Edit any input to save this to the deal and show it on the Pipeline.';

  return (
    <div className="space-y-6">
      <div className="card px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Headline label="Levered IRR" value={calc.irr != null ? fmtPct(calc.irr * 100) : '—'} />
        <Headline label="Equity Multiple" value={calc.em != null ? `${calc.em.toFixed(2)}x` : '—'} />
        <Headline label="YoC (Total Cap)" value={fmtPct(calc.yocTotalCap * 100)} />
        <Headline label="Equity Check" value={fmt(calc.equity)} />
        <p className={`col-span-full text-[11px] ${status === 'error' ? 'text-red-600' : 'text-slate-500'}`}>{note}</p>
      </div>

      {groups.map(g => (
        <section key={g.title}>
          <h4 className="section-label mb-2">{g.title}</h4>
          <div className="grid grid-cols-2 gap-3">
            {g.fields.map(({ key, label, step }) => (
              <div key={key}>
                <label className="field-label">{label}</label>
                <input
                  type="number"
                  step={step || '1000'}
                  value={inputs[key]}
                  onChange={(e) => update(key, e.target.value)}
                  className="field font-mono tabular-nums"
                />
              </div>
            ))}
          </div>
        </section>
      ))}

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
          { label: 'Equity Check', value: fmt(calc.equity), bold: true, highlight: true },
        ]} />

        <ResultSection title="Returns" items={[
          { label: 'Stabilized NOI (Year 1)', value: fmt(calc.noi) },
          { label: `Annual Debt Service (${inputs.interestPct}% interest-only)`, value: fmt(calc.debtService) },
          { label: 'Cash Flow (Year 1)', value: fmt(calc.cashFlow) },
          { label: 'YoC (Total Cap)', value: fmtPct(calc.yocTotalCap * 100), bold: true },
          { label: 'YoC (Equity)', value: fmtPct(calc.yocEquity * 100), bold: true },
          { label: 'Cash-on-Cash (Year 1)', value: fmtPct(calc.cashOnCash * 100), bold: true },
          { label: `Exit Value (Year ${inputs.holdYears}, ${inputs.exitCapPct}% cap)`, value: fmt(calc.exitValue) },
          { label: 'Levered IRR', value: calc.irr != null ? fmtPct(calc.irr * 100) : '—', bold: true, highlight: true },
          { label: 'Equity Multiple', value: calc.em != null ? `${calc.em.toFixed(2)}x` : '—', bold: true, highlight: true },
        ]} />
        <p className="text-[11px] leading-relaxed text-slate-500">
          Screening estimate: NOI is stabilized from year 1 and grows each year; debt is interest-only on the loan; the
          sale is at the exit cap on the next year&apos;s NOI, less sale costs and the loan. The deal&apos;s Excel model
          replaces these numbers on the Pipeline once it syncs.
        </p>
      </section>
    </div>
  );
}

function Headline({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="stat-label">{label}</p>
      <p className="mt-0.5 text-lg font-semibold font-mono tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
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
