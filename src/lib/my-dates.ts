// "Your dates this week" for the Daily Brief: contract deadlines on live deals, diligence
// checklist lines coming due, asset bulletin dates, personal reminders and follow-ups.
// Overdue items that are still open are included; contract milestones that have passed are not.
import { all } from './db';
import { timeline } from './contract-terms';

export interface MyDate {
  date: string;              // YYYY-MM-DD
  kind: 'deal' | 'checklist' | 'asset' | 'personal' | 'task';
  what: string;              // "EM due", "Insurance renewal", "4 checklist lines"
  where: string;             // deal / property name
  amount?: number | null;
  href: string;
}

const LIVE = "stage NOT IN ('Dead', 'Closed', 'Tracking')";

export async function myDates(today: string, days = 7): Promise<MyDate[]> {
  const end = addDays(today, days);
  const out: MyDate[] = [];

  // Contract milestones on live deals (from the PSA terms, else the dates typed on the deal).
  const deals = await all<{ id: number; name: string; psa_effective: string | null; dd_days: number | null; close_days: number | null; em_days: number | null; em_business: number | null; deposit: number | null; deposit_2: number | null; dd_expiry: string | null; close_date: string | null }>(
    `SELECT id, name, psa_effective, dd_days, close_days, em_days, em_business, deposit, deposit_2, dd_expiry, close_date FROM deals WHERE ${LIVE}`);
  for (const d of deals) {
    const ms = d.psa_effective ? timeline({ ...d, dd_days: d.dd_days || null, close_days: d.close_days || null }) : [];
    const list = ms.length ? ms.filter(m => m.key !== 'effective').map(m => ({ date: m.date, what: m.label.replace(' (deposit goes hard)', ''), amount: m.amount }))
      : [d.dd_expiry && { date: d.dd_expiry, what: 'DD expires', amount: null }, d.close_date && { date: d.close_date, what: 'Closing', amount: null }].filter(Boolean) as { date: string; what: string; amount: number | null }[];
    for (const m of list) if (m.date >= today && m.date <= end) out.push({ ...m, kind: 'deal', where: d.name, href: '/properties' });
  }

  // Diligence checklist lines, at most two rows per deal: overdue, and due this week.
  const dd = await all<{ name: string; late: number; n: number; first: string; last: string }>(
    `SELECT d.name, CASE WHEN i.due_date < ? THEN 1 ELSE 0 END AS late, COUNT(*) AS n, MIN(i.due_date) AS first, MAX(i.due_date) AS last
     FROM dd_items i JOIN deals d ON d.id = i.deal_id
     WHERE i.status IN ('open', 'in_progress') AND i.due_date IS NOT NULL AND i.due_date <= ? AND d.${LIVE}
     GROUP BY i.deal_id, late`, [today, end]);
  for (const r of dd) {
    const lines = `${r.n} checklist line${Number(r.n) === 1 ? '' : 's'}`;
    out.push({ date: r.first, kind: 'checklist', what: Number(r.late) ? `${lines} past due` : r.first === r.last ? `${lines} due` : `${lines} due by ${short(r.last)}`, where: r.name, href: '/diligence' });
  }

  // Asset bulletin dates on owned properties.
  const assets = await all<{ deal_id: number; name: string; title: string; due_date: string }>(
    `SELECT i.deal_id, d.name, i.title, i.due_date FROM asset_items i JOIN deals d ON d.id = i.deal_id
     WHERE i.kind = 'date' AND i.done_at IS NULL AND i.due_date IS NOT NULL AND i.due_date <= ? AND d.stage = 'Closed' ORDER BY i.due_date`, [end]);
  for (const a of assets) out.push({ date: a.due_date, kind: 'asset', what: a.title || 'Date', where: a.name, href: `/assets/${a.deal_id}` });

  // Personal property reminders.
  const personal = await all<{ slug: string | null; pname: string | null; name: string; due_date: string; amount: number | null }>(
    `SELECT p.slug, p.name AS pname, r.name, r.due_date, r.amount FROM personal_reminders r LEFT JOIN personal_properties p ON p.id = r.property_id
     WHERE r.dismissed = 0 AND r.due_date <= ? ORDER BY r.due_date`, [end]);
  for (const p of personal) out.push({ date: p.due_date, kind: 'personal', what: p.name, where: p.pname || 'Personal', amount: p.amount, href: p.slug ? `/assets/personal/${p.slug}/property` : '/assets' });

  // Contact follow-ups: one row for overdue, one for this week.
  const tasks = await all<{ late: number; n: number; first: string }>(
    `SELECT CASE WHEN due_date < ? THEN 1 ELSE 0 END AS late, COUNT(*) AS n, MIN(due_date) AS first FROM tasks
     WHERE done = 0 AND due_date IS NOT NULL AND due_date <= ? GROUP BY late`, [today, end]);
  for (const t of tasks) out.push({ date: t.first, kind: 'task', what: `${t.n} follow-up${Number(t.n) === 1 ? '' : 's'}${Number(t.late) ? ' past due' : ''}`, where: 'Contacts', href: '/' });

  const order = { deal: 0, asset: 1, personal: 2, checklist: 3, task: 4 } as const;
  // Contract deadlines first, then the rest by kind; each kind by date.
  return out.sort((a, b) => order[a.kind] - order[b.kind] || a.date.localeCompare(b.date));
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (iso: string) => `${MON[Number(iso.slice(5, 7)) - 1]} ${Number(iso.slice(8, 10))}`;

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
