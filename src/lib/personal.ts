// Personal properties (Clayton, Emerson): Ben's own holdings, moved from the old
// property-accounting app. They live in personal_* tables and are kept out of every Sandpiper
// figure: Assets totals, the Dashboard, exports, search and share links.
// Pure helpers and fixed terms, shared by the /api/personal routes and the pages.

export const PERSONAL_SLUGS = ['clayton', 'emerson'] as const;
export type PersonalSlug = (typeof PERSONAL_SLUGS)[number];
export const isPersonalSlug = (s: string): s is PersonalSlug => (PERSONAL_SLUGS as readonly string[]).includes(s);

export interface PersonalProperty {
  id: string; slug: PersonalSlug; name: string; address: string; entity: string;
  est_value: number; loan_balance: number; loan_servicer: string; loan_servicer_url: string;
  loan_number: string; loan_rate: number; loan_payment: number; loan_matures: string;
  bank_name: string; bank_last_four: string; tenant_name: string; tenant_rent: number;
}
export interface UtilityBill {
  id?: string; month: string; utility_type: UtilityType;
  amount_paid: number | null; date_paid: string | null;
  amount_recharged: number | null; date_recharged: string | null; notes: string | null;
}
export interface Checkin {
  rent_received: number; rent_received_date: string | null; mortgage_paid: number; mortgage_paid_date: string | null;
  notes: string | null; completed_at: string | null;
}
export interface PersonalReminder {
  id: string; name: string; due_date: string; category: string; amount: number | null;
  recurring: number; recur_months: number | null; notes: string | null;
}
export interface PersonalTx { id: string; date: string; description: string; category: string; type: 'Income' | 'Expense'; amount: number; source: string | null; notes: string | null }
export interface NotePayment { id: string; date: string; amount: number; principal: number; interest: number; balance_after: number }

export const UTILITIES = ['water', 'trash', 'stormwater'] as const;
export type UtilityType = (typeof UTILITIES)[number];
export const UTILITY_LABEL: Record<UtilityType, string> = { water: 'Water', trash: 'Trash', stormwater: 'Stormwater' };

export const REMINDER_CATEGORIES = ['Rent', 'Mortgage', 'Water', 'Trash', 'Stormwater', 'Property tax', 'Insurance', 'Maintenance', 'Dan payback', 'Other'];

// Clayton: owned through TB Capital.
export const CLAYTON_OWNERS = [
  { name: 'Ben Backer', pct: 21.9, contributed: 25000, me: true },
  { name: 'Troy Bishop', pct: 21.9, contributed: 25000 },
  { name: "Troy's Dad", pct: 61.4, contributed: 70000 },
];

// Emerson: Ben's construction receivable comes off the top of a sale; then Dan's note; then 50/50.
export const EMERSON_CONSTRUCTION = 229814;
// The note Dan is paying back (5-year amortizing).
export const NOTE = { principal: 104205, rate: 0.045, termMonths: 60, monthly: 1941.93 };
export const SALE_COST_PCT = 0.06;

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function addMonths(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1 + months, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
export const usd = (n: number | null | undefined) =>
  n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);
export const fmtDay = (s: string | null | undefined) =>
  s ? new Date(s.slice(0, 10) + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

// The note's full amortization schedule.
export function noteSchedule() {
  const rows: { n: number; principal: number; interest: number; balance: number }[] = [];
  let b = NOTE.principal;
  for (let i = 1; i <= NOTE.termMonths; i++) {
    const interest = b * (NOTE.rate / 12);
    const principal = NOTE.monthly - interest;
    b -= principal;
    rows.push({ n: i, principal: round2(principal), interest: round2(interest), balance: round2(Math.max(0, b)) });
  }
  return rows;
}

export const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// ── Monthly audit and tax year (Oct 19, 2026) ─────────────────────────────
// The ledger (personal_transactions) is the record. Bank statement lines feed it; the monthly
// audit checks each month's ledger against what the property should do (personal_expected);
// the tax year sums it into a Schedule E view.

export const NOTE_CATEGORY = "Dan's note";      // a statement line that is one of Dan's payments
// Every category a ledger entry or statement line can take. The sign of the amount sets
// Income vs Expense; Water/Trash/Stormwater as Income are tenant recharges.
export const LEDGER_CATEGORIES = [
  'Rent', 'Mortgage', 'Water', 'Trash', 'Stormwater', 'Property tax', 'Insurance', 'Maintenance', 'Bank fees', 'Other',
  'Owner contribution', 'Owner draw', 'Transfer',
] as const;
// Money moving between Ben and the property's account, not rental income or expense.
export const NON_OPERATING = new Set(['Owner contribution', 'Owner draw', 'Transfer']);
export const UTILITY_CATEGORIES = new Set(['Water', 'Trash', 'Stormwater']);
// Entries recorded from the 1098 or paid by the servicer out of escrow: in the tax view, not in
// bank cash flow (the bank only sees the full mortgage payment).
export const ESCROW_SOURCES = new Set(['1098', 'servicer-escrow']);

export interface Expected {
  id: string; label: string; type: 'Income' | 'Expense'; category: string; amount: number | null;
  every_months: number; start_month: string | null; end_month: string | null; match: string | null; sort: number;
}
export interface StatementLine {
  id: string; date: string; description: string; amount: number; balance: number | null;
  category: string | null; status: 'new' | 'posted' | 'linked'; tx_id: string | null; import_id: string | null;
}
export type AuditStatus = 'ok' | 'differs' | 'missing' | 'skipped' | 'upcoming';
export interface AuditRow { expected: Expected; status: AuditStatus; actual: number | null; date: string | null; note?: string | null }
export type MonthState = 'closed' | 'issues' | 'ready' | 'open' | 'future' | 'empty';
export interface AuditMonth {
  month: string; state: MonthState; rows: AuditRow[]; lines: StatementLine[]; uncategorized: number;
  closedAt: string | null; notes: string | null; income: number; expense: number;
}

export function monthIndex(m: string): number { const [y, mo] = m.split('-').map(Number); return y * 12 + (mo - 1); }
export function expectedIn(e: Expected, month: string): boolean {
  if (e.start_month && month < e.start_month) return false;
  if (e.end_month && month > e.end_month) return false;
  const every = Math.max(1, e.every_months || 1);
  return every === 1 || (monthIndex(month) - monthIndex(e.start_month || month)) % every === 0;
}
export const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Documents to gather for the CPA each year.
export function taxDocList(slug: string): string[] {
  const common = ['Mortgage 1098', 'Property tax statement', 'Insurance declarations page', 'Bank statements (all 12 months)', 'Lease(s) in effect'];
  return slug === 'clayton' ? [...common, 'TB Capital partnership return / K-1'] : [...common, "Dan's note: interest received"];
}
