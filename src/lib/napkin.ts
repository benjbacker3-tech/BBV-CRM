// Napkin Math: a quick screening underwrite for deals that don't have a full Excel model yet.
// Saved on the deal (deals.napkin, JSON) so its returns show on the Pipeline until a synced
// model replaces them. Pure functions, shared by the deal tab and the Pipeline.
//
// Simplifications, on purpose: stabilized NOI from year 1, interest-only debt on the loan
// (LTC of total capitalization), NOI grows annually, sale at the end of the hold at the exit
// cap on the next year's NOI, less sale costs. Annual cash flows; levered to the equity.

export interface NapkinInputs {
  purchasePrice: number;
  capex: number;
  leasingCommissions: number;
  acquisitionFeePct: number;
  closingCosts: number;
  ltcPct: number;
  interestPct: number;
  stabilizedNOI: number;   // 0 = estimate from rent × land SF × 75% margin
  marketRentPSF: number;   // $/SF of land per year
  acreage: number;
  holdYears: number;
  exitCapPct: number;
  noiGrowthPct: number;
  saleCostPct: number;
}

export interface NapkinOutputs {
  acquisitionFee: number;
  totalCap: number;
  loanAmount: number;
  equity: number;
  noi: number;
  debtService: number;
  cashFlow: number;
  yocTotalCap: number;  // decimals (0.072 = 7.2%)
  yocEquity: number;
  cashOnCash: number;
  exitValue: number;
  irr: number | null;   // levered, decimal
  em: number | null;    // levered equity multiple
}

export interface SavedNapkin { v: 1; inputs: NapkinInputs; out: NapkinOutputs; saved_at: string }

export const NAPKIN_DEFAULTS: Omit<NapkinInputs, 'purchasePrice' | 'acreage'> = {
  capex: 500000,
  leasingCommissions: 50000,
  acquisitionFeePct: 1.5,
  closingCosts: 100000,
  ltcPct: 65,
  interestPct: 5.5,
  stabilizedNOI: 0,
  marketRentPSF: 5.25,
  holdYears: 5,
  exitCapPct: 7,
  noiGrowthPct: 3,
  saleCostPct: 2,
};

const SQFT_PER_ACRE = 43560;

// IRR by bisection on annual cash flows (flows[0] is the negative equity check).
export function irrOf(flows: number[]): number | null {
  const npv = (r: number) => flows.reduce((s, cf, t) => s + cf / Math.pow(1 + r, t), 0);
  let lo = -0.99, hi = 5;
  if (npv(lo) * npv(hi) > 0) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

export function napkinCalc(i: NapkinInputs): NapkinOutputs {
  const acquisitionFee = i.purchasePrice * (i.acquisitionFeePct / 100);
  const totalCap = i.purchasePrice + i.capex + i.leasingCommissions + acquisitionFee + i.closingCosts;
  const loanAmount = totalCap * (i.ltcPct / 100);
  const equity = totalCap - loanAmount;
  const noi = i.stabilizedNOI || i.marketRentPSF * i.acreage * SQFT_PER_ACRE * 0.75;
  const debtService = loanAmount * (i.interestPct / 100);
  const cashFlow = noi - debtService;

  const hold = Math.max(1, Math.round(i.holdYears || 0));
  const g = i.noiGrowthPct / 100;
  const noiYear = (t: number) => noi * Math.pow(1 + g, t - 1);
  const exitValue = i.exitCapPct > 0 ? noiYear(hold + 1) / (i.exitCapPct / 100) : 0;
  const netSale = exitValue * (1 - i.saleCostPct / 100) - loanAmount;

  const flows = [-equity];
  for (let t = 1; t <= hold; t++) flows.push(noiYear(t) - debtService + (t === hold ? netSale : 0));
  const inflows = flows.slice(1).reduce((s, x) => s + x, 0);
  const ok = equity > 0 && noi > 0 && exitValue > 0;

  return {
    acquisitionFee, totalCap, loanAmount, equity, noi, debtService, cashFlow,
    yocTotalCap: totalCap > 0 ? noi / totalCap : 0,
    yocEquity: equity > 0 ? noi / equity : 0,
    cashOnCash: equity > 0 ? cashFlow / equity : 0,
    exitValue,
    irr: ok ? irrOf(flows) : null,
    em: ok ? inflows / equity : null,
  };
}

// The saved napkin on a deal, or null if there isn't a usable one.
export function savedNapkin(raw: string | null | undefined): SavedNapkin | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    return s && s.inputs && s.out ? (s as SavedNapkin) : null;
  } catch {
    return null;
  }
}
