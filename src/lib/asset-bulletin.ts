// Asset bulletin for closed Sandpiper deals (asset_items table): key dates to see coming
// (lease, insurance, tax, loan renewals) and running notes. Day-to-day work sits with the
// property manager; this is the owner's view. Pure helpers, shared by the API and pages.

export interface AssetItem {
  id: number;
  deal_id: number;
  kind: 'date' | 'note';
  category: string;
  title: string;
  body: string | null;
  due_date: string | null;
  recur_months: number | null;
  lead_days: number | null;
  last_done: string | null;
  done_at: string | null;
  pinned: number;
  created_at: string;
}

export const ASSET_CATEGORIES = ['Lease', 'Insurance', 'Tax', 'Loan', 'Entity', 'Property', 'Other'] as const;

// "Add standard dates" seeds these with no date set; Ben fills in the dates that apply.
export const STANDARD_DATES: { category: string; title: string; recur_months: number | null; lead_days: number; body?: string }[] = [
  { category: 'Lease', title: 'Lease expiration', recur_months: null, lead_days: 365, body: 'Start renewal or re-leasing talks well ahead.' },
  { category: 'Lease', title: 'Renewal option notice deadline', recur_months: null, lead_days: 120, body: "Last day for the tenant to exercise its renewal option (check the lease's notice period)." },
  { category: 'Lease', title: 'Annual rent escalation', recur_months: 12, lead_days: 30 },
  { category: 'Lease', title: 'Tenant insurance certificate (COI) renewal', recur_months: 12, lead_days: 30, body: 'Get the updated certificate naming the owner as additional insured.' },
  { category: 'Insurance', title: 'Property insurance renewal', recur_months: 12, lead_days: 60, body: 'Get quotes, confirm limits and lender requirements.' },
  { category: 'Tax', title: 'Property tax due', recur_months: 12, lead_days: 45 },
  { category: 'Loan', title: 'Loan maturity', recur_months: null, lead_days: 270, body: 'Plan the refinance, extension or sale.' },
  { category: 'Loan', title: 'Rate cap expiration', recur_months: null, lead_days: 90 },
  { category: 'Entity', title: 'Entity annual report / registered agent', recur_months: 12, lead_days: 30 },
  { category: 'Property', title: 'Year-end CAM / expense reconciliation', recur_months: 12, lead_days: 45 },
];

export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

export function daysTo(iso: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.round((new Date(iso + 'T00:00:00').getTime() - today.getTime()) / 86_400_000);
}

// How urgent a date is: overdue, inside its lead window, or later.
export function dateStatus(i: Pick<AssetItem, 'due_date' | 'lead_days'>): { tone: 'red' | 'amber' | 'slate' | 'muted'; label: string; days: number | null } {
  if (!i.due_date) return { tone: 'muted', label: 'Set date', days: null };
  const d = daysTo(i.due_date);
  if (d < 0) return { tone: 'red', label: `${-d}d overdue`, days: d };
  if (d === 0) return { tone: 'red', label: 'Today', days: d };
  const lead = i.lead_days ?? 60;
  const label = d <= 60 ? `In ${d}d` : d < 730 ? `In ${Math.round(d / 30.4)} mo` : `In ${(d / 365).toFixed(1)} yr`;
  return { tone: d <= Math.min(lead, 30) ? 'red' : d <= lead ? 'amber' : 'slate', label, days: d };
}

export const TONE_PILL = { red: 'pill-red', amber: 'pill-amber', slate: 'pill-slate', muted: 'pill-muted' } as const;
