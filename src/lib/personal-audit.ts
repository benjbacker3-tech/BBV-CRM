// Monthly audit, bank statement import and tax year for the personal properties (Clayton,
// Emerson). See lib/personal.ts for the model: the ledger (personal_transactions) is the record;
// statement lines feed it; each month is checked against the property's expected lines.
import { all, get, run } from './db';
import {
  AuditMonth, AuditRow, ESCROW_SOURCES, Expected, MonthState, NON_OPERATING, NOTE, NOTE_CATEGORY, NotePayment,
  PersonalProperty, PersonalTx, StatementLine, UTILITY_CATEGORIES, currentMonth, expectedIn, newId, round2, taxDocList,
} from './personal';
import { ParsedStatement, descriptionKey, fingerprints } from './statement-parse';
import { aiConfigured, extract, pdfBlock } from './ai';

const AMOUNT_TOLERANCE = 1;       // dollars: an expected fixed amount within this counts as matching
const LINK_DAYS = 6;              // a statement line and a ledger entry this close in date are the same payment

// ── Dan's note ─────────────────────────────────────────────────────────

// Logs one of Dan's payments: interest on the running balance, the rest to principal. The
// interest is also written to Emerson's ledger as income. Returns the payment id.
export async function logNotePayment(date: string, amount: number): Promise<string> {
  const last = await get<NotePayment>('SELECT * FROM personal_note_payments ORDER BY date DESC LIMIT 1');
  const balance = last ? last.balance_after : NOTE.principal;
  const interest = balance * (NOTE.rate / 12);
  const principal = amount - interest;
  const id = newId();
  await run('INSERT INTO personal_note_payments (id, date, amount, principal, interest, balance_after, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, date, amount, round2(principal), round2(interest), round2(Math.max(0, balance - principal)), new Date().toISOString()]);
  const emerson = await get<{ id: string }>("SELECT id FROM personal_properties WHERE slug = 'emerson'");
  if (emerson) {
    await addLedger(emerson.id, {
      date, description: 'Dan Equity Loan - Interest', category: 'Dan payback', type: 'Income', amount: interest, source: 'dan-payment',
      notes: `Interest of $${amount.toFixed(2)} payment. Principal: $${principal.toFixed(2)}`,
    });
  }
  return id;
}

async function addLedger(propertyId: string, t: { date: string; description: string; category: string; type: 'Income' | 'Expense'; amount: number; source?: string | null; notes?: string | null }): Promise<string> {
  const id = newId();
  await run('INSERT INTO personal_transactions (id, property_id, date, description, category, type, amount, source, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [id, propertyId, t.date, t.description, t.category, t.type, round2(Math.abs(t.amount)), t.source ?? null, t.notes ?? null]);
  return id;
}

// ── Monthly audit ──────────────────────────────────────────────────────

export const loadExpected = (propertyId: string) =>
  all<Expected>('SELECT * FROM personal_expected WHERE property_id = ? ORDER BY sort, start_month', [propertyId]);

export async function auditYear(p: PersonalProperty, year: string): Promise<AuditMonth[]> {
  const expected = await loadExpected(p.id);
  const tx = await all<PersonalTx>("SELECT * FROM personal_transactions WHERE property_id = ? AND substr(date, 1, 4) = ? ORDER BY date", [p.id, year]);
  const notes = p.slug === 'emerson' ? await all<NotePayment>("SELECT * FROM personal_note_payments WHERE substr(date, 1, 4) = ?", [year]) : [];
  const lines = await all<StatementLine>("SELECT * FROM personal_statement_lines WHERE property_id = ? AND substr(date, 1, 4) = ? ORDER BY date, amount", [p.id, year]);
  const checkins = await all<{ month: string; completed_at: string | null; notes: string | null }>(
    "SELECT month, completed_at, notes FROM personal_checkins WHERE property_id = ? AND substr(month, 1, 4) = ?", [p.id, year]);
  const skips = await all<{ month: string; expected_id: string; note: string | null }>(
    "SELECT month, expected_id, note FROM personal_audit_skips WHERE property_id = ? AND substr(month, 1, 4) = ?", [p.id, year]);
  const now = currentMonth();

  return Array.from({ length: 12 }, (_, i) => {
    const month = `${year}-${String(i + 1).padStart(2, '0')}`;
    const mtx = tx.filter(t => t.date.startsWith(month) && !ESCROW_SOURCES.has(t.source || ''));
    const rows: AuditRow[] = expected.filter(e => expectedIn(e, month)).map(e => {
      const skip = skips.find(s => s.month === month && s.expected_id === e.id);
      if (skip) return { expected: e, status: 'skipped', actual: null, date: null, note: skip.note };
      const hits = e.category === NOTE_CATEGORY
        ? notes.filter(n => n.date.startsWith(month)).map(n => ({ amount: n.amount, date: n.date }))
        : mtx.filter(t => t.category === e.category && t.type === e.type).map(t => ({ amount: t.amount, date: t.date }));
      if (!hits.length) return { expected: e, status: month >= now ? 'upcoming' : 'missing', actual: null, date: null };
      const actual = round2(hits.reduce((s, h) => s + h.amount, 0));
      const off = e.amount != null && Math.abs(actual - e.amount) > AMOUNT_TOLERANCE;
      return { expected: e, status: off ? 'differs' : 'ok', actual, date: hits[0].date };
    });
    const mlines = lines.filter(l => l.date.startsWith(month));
    const uncategorized = mlines.filter(l => l.status === 'new').length;
    const c = checkins.find(x => x.month === month);
    const income = round2(mtx.filter(t => t.type === 'Income' && !NON_OPERATING.has(t.category)).reduce((s, t) => s + t.amount, 0));
    const expense = round2(mtx.filter(t => t.type === 'Expense' && !NON_OPERATING.has(t.category)).reduce((s, t) => s + t.amount, 0));
    let state: MonthState;
    if (c?.completed_at) state = 'closed';
    else if (month > now) state = mtx.length || mlines.length ? 'open' : 'future';
    else if (rows.some(r => r.status === 'missing' || r.status === 'differs') || uncategorized) state = 'issues';
    else if (!rows.length && !mtx.length && !mlines.length) state = 'empty';
    else if (month === now) state = 'open';
    else state = 'ready';
    return { month, state, rows, lines: mlines, uncategorized, closedAt: c?.completed_at ?? null, notes: c?.notes ?? null, income, expense };
  });
}

async function checkin(propertyId: string, month: string, set: { completed_at?: string | null; notes?: string | null }) {
  const row = await get<{ id: string }>('SELECT id FROM personal_checkins WHERE property_id = ? AND month = ?', [propertyId, month]);
  if (!row) await run('INSERT INTO personal_checkins (id, property_id, month) VALUES (?, ?, ?)', [newId(), propertyId, month]);
  if ('completed_at' in set) await run('UPDATE personal_checkins SET completed_at = ? WHERE property_id = ? AND month = ?', [set.completed_at ?? null, propertyId, month]);
  if ('notes' in set) await run('UPDATE personal_checkins SET notes = ? WHERE property_id = ? AND month = ?', [set.notes ?? null, propertyId, month]);
}
export const closeMonth = (pid: string, month: string) => checkin(pid, month, { completed_at: new Date().toISOString() });
export const reopenMonth = (pid: string, month: string) => checkin(pid, month, { completed_at: null });
export const setMonthNotes = (pid: string, month: string, notes: string) => checkin(pid, month, { notes: notes.trim() || null });

// An expected line confirmed by hand (no statement for that month): record it in the ledger.
export async function confirmExpected(p: PersonalProperty, expectedId: string, date: string, amount: number) {
  const e = await get<Expected>('SELECT * FROM personal_expected WHERE id = ? AND property_id = ?', [expectedId, p.id]);
  if (!e) throw new Error('Not found');
  if (e.category === NOTE_CATEGORY) return logNotePayment(date, amount);
  return addLedger(p.id, { date, description: e.label, category: e.category, type: e.type, amount, source: 'manual' });
}

export async function skipExpected(pid: string, month: string, expectedId: string, note: string | null) {
  await run('INSERT OR REPLACE INTO personal_audit_skips (property_id, month, expected_id, note) VALUES (?, ?, ?, ?)', [pid, month, expectedId, note]);
}
export const unskipExpected = (pid: string, month: string, expectedId: string) =>
  run('DELETE FROM personal_audit_skips WHERE property_id = ? AND month = ? AND expected_id = ?', [pid, month, expectedId]);

// What the tenant still owes for utilities Ben paid: bills paid minus recharges received.
export async function utilitiesOwed(pid: string): Promise<{ category: string; owed: number }[]> {
  const rows = await all<{ category: string; type: string; s: number }>(
    "SELECT category, type, SUM(amount) AS s FROM personal_transactions WHERE property_id = ? AND category IN ('Water', 'Trash', 'Stormwater') GROUP BY category, type", [pid]);
  const by = new Map<string, number>();
  for (const r of rows) by.set(r.category, (by.get(r.category) ?? 0) + (r.type === 'Expense' ? Number(r.s) : -Number(r.s)));
  return Array.from(by.entries()).map(([category, owed]) => ({ category, owed: round2(owed) })).filter(x => Math.abs(x.owed) >= 0.01);
}

// ── Statement import ───────────────────────────────────────────────────

export interface ImportResult { importId: string; lines: number; added: number; linked: number; posted: number; review: number; duplicates: number; balanced: boolean | null; closingBalance: number | null; first: string | null; last: string | null }

export async function importStatement(p: PersonalProperty, fileName: string, kind: 'csv' | 'pdf', parsed: ParsedStatement): Promise<ImportResult> {
  const importId = newId();
  const fps = fingerprints(parsed.lines);
  const dates = parsed.lines.map(l => l.date).sort();
  const res: ImportResult = { importId, lines: parsed.lines.length, added: 0, linked: 0, posted: 0, review: 0, duplicates: 0, balanced: parsed.balanced, closingBalance: parsed.closingBalance, first: dates[0] ?? null, last: dates[dates.length - 1] ?? null };
  await run('INSERT INTO personal_statement_imports (id, property_id, file_name, kind, first_date, last_date, lines, closing_balance, balanced) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [importId, p.id, fileName, kind, res.first, res.last, res.lines, parsed.closingBalance, parsed.balanced == null ? null : parsed.balanced ? 1 : 0]);

  const expected = await loadExpected(p.id);
  const rules = new Map((await all<{ pattern: string; category: string }>('SELECT pattern, category FROM personal_rules WHERE property_id = ?', [p.id])).map(r => [r.pattern, r.category]));

  for (let i = 0; i < parsed.lines.length; i++) {
    const l = parsed.lines[i];
    if (await get('SELECT id FROM personal_statement_lines WHERE property_id = ? AND fingerprint = ?', [p.id, fps[i]])) { res.duplicates++; continue; }
    const id = newId();
    await run('INSERT INTO personal_statement_lines (id, property_id, import_id, date, description, amount, balance, fingerprint) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, p.id, importId, l.date, l.description, l.amount, l.balance, fps[i]]);
    res.added++;

    // 1. Already in the ledger (entered by hand, or from an earlier import of another format).
    const link = await findLedgerMatch(p, l.date, l.amount);
    if (link) {
      await run("UPDATE personal_statement_lines SET status = 'linked', tx_id = ?, category = ? WHERE id = ?", [link.txId, link.category, id]);
      res.linked++;
      continue;
    }
    // 2. A rule learned from an earlier month, else 3. an expected line's words.
    const month = l.date.slice(0, 7);
    const desc = l.description.toLowerCase();
    const category = rules.get(descriptionKey(l.description))
      ?? expected.find(e => expectedIn(e, month) && (e.type === 'Income') === l.amount > 0
        && (e.match || '').split(',').map(w => w.trim().toLowerCase()).filter(Boolean).some(w => desc.includes(w)))?.category;
    if (category) {
      await postLine(p, id, category);
      res.posted++;
    } else res.review++;
  }
  // The same file again (or an overlapping one) that added nothing: don't list it as an import.
  if (!res.added) await run('DELETE FROM personal_statement_imports WHERE id = ?', [importId]);
  return res;
}

async function findLedgerMatch(p: PersonalProperty, date: string, amount: number): Promise<{ txId: string; category: string } | null> {
  const type = amount > 0 ? 'Income' : 'Expense';
  const lo = shiftDay(date, -LINK_DAYS), hi = shiftDay(date, LINK_DAYS);
  const cands = await all<PersonalTx>(
    `SELECT * FROM personal_transactions WHERE property_id = ? AND type = ? AND ABS(amount - ?) < 0.011 AND date BETWEEN ? AND ?
       AND COALESCE(source, '') NOT IN ('1098', 'servicer-escrow')
       AND id NOT IN (SELECT tx_id FROM personal_statement_lines WHERE property_id = ? AND tx_id IS NOT NULL)`,
    [p.id, type, Math.abs(amount), lo, hi, p.id]);
  const best = cands.sort((a, b) => Math.abs(dayDiff(a.date, date)) - Math.abs(dayDiff(b.date, date)))[0];
  if (best) return { txId: best.id, category: best.category };
  if (p.slug === 'emerson' && amount > 0) {
    const n = await get<{ id: string }>(
      `SELECT id FROM personal_note_payments WHERE ABS(amount - ?) < 0.011 AND date BETWEEN ? AND ?
         AND ('note:' || id) NOT IN (SELECT tx_id FROM personal_statement_lines WHERE tx_id IS NOT NULL)`, [amount, lo, hi]);
    if (n) return { txId: `note:${n.id}`, category: NOTE_CATEGORY };
  }
  return null;
}

// Record a statement line in the ledger under a category.
async function postLine(p: PersonalProperty, lineId: string, category: string) {
  const l = await get<StatementLine>('SELECT * FROM personal_statement_lines WHERE id = ?', [lineId]);
  if (!l) return;
  const txId = category === NOTE_CATEGORY && p.slug === 'emerson' && l.amount > 0
    ? `note:${await logNotePayment(l.date, l.amount)}`
    : await addLedger(p.id, { date: l.date, description: l.description, category, type: l.amount > 0 ? 'Income' : 'Expense', amount: l.amount, source: `statement:${l.id}` });
  await run("UPDATE personal_statement_lines SET status = 'posted', tx_id = ?, category = ? WHERE id = ?", [txId, category, lineId]);
}

// Ben sets (or changes) a line's category. With remember, the description becomes a rule and
// every other waiting line with the same payee is filed the same way. Returns lines filed.
export async function categorizeLine(p: PersonalProperty, lineId: string, category: string, remember: boolean): Promise<number> {
  const l = await get<StatementLine>('SELECT * FROM personal_statement_lines WHERE id = ? AND property_id = ?', [lineId, p.id]);
  if (!l) throw new Error('Not found');
  if (l.tx_id?.startsWith('note:')) throw new Error("This line is one of Dan's payments; change it on the Dan's note tab.");
  if (l.status === 'new') await postLine(p, l.id, category);
  else if (category === NOTE_CATEGORY) {
    if (l.status === 'posted' && l.tx_id) await run('DELETE FROM personal_transactions WHERE id = ?', [l.tx_id]);
    await postLine(p, l.id, category);
  } else {
    if (l.tx_id) await run('UPDATE personal_transactions SET category = ? WHERE id = ? AND property_id = ?', [category, l.tx_id, p.id]);
    await run('UPDATE personal_statement_lines SET category = ? WHERE id = ?', [category, l.id]);
  }
  let filed = 1;
  if (remember) {
    const key = descriptionKey(l.description);
    if (key) {
      await run('INSERT OR REPLACE INTO personal_rules (property_id, pattern, category) VALUES (?, ?, ?)', [p.id, key, category]);
      const waiting = await all<StatementLine>("SELECT * FROM personal_statement_lines WHERE property_id = ? AND status = 'new' AND id != ?", [p.id, l.id]);
      for (const w of waiting) if (descriptionKey(w.description) === key) { await postLine(p, w.id, category); filed++; }
    }
  }
  return filed;
}

// A PDF statement: Claude reads it. The opening balance plus every line must equal the
// closing balance, or the import is flagged.
export async function readStatementPdf(bytes: ArrayBuffer): Promise<ParsedStatement> {
  if (!aiConfigured()) throw new Error('PDF statements need Claude reading (ANTHROPIC_API_KEY). Download the CSV instead.');
  const r = await extract<{ opening_balance: number | null; closing_balance: number | null; transactions: { date: string; description: string; amount: number }[] }>({
    model: 'careful',
    maxTokens: 16000,
    system: 'You transcribe U.S. bank account statements exactly. List every transaction in the statement (deposits, withdrawals, checks, fees), never summary rows. Use the posting date. Amount is positive for money in and negative for money out.',
    content: [pdfBlock(bytes), { type: 'text', text: 'List the statement\'s opening balance, closing balance and every transaction.' }],
    schema: {
      properties: {
        opening_balance: { type: ['number', 'null'] },
        closing_balance: { type: ['number', 'null'] },
        transactions: { type: 'array', items: { type: 'object', properties: { date: { type: 'string', description: 'YYYY-MM-DD' }, description: { type: 'string' }, amount: { type: 'number' } }, required: ['date', 'description', 'amount'] } },
      },
      required: ['opening_balance', 'closing_balance', 'transactions'],
    },
  });
  const lines = (r.transactions || []).filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && typeof t.amount === 'number' && t.amount !== 0)
    .map(t => ({ date: t.date, description: String(t.description || '').replace(/\s+/g, ' ').trim() || '(no description)', amount: round2(t.amount), balance: null }));
  const sum = lines.reduce((s, l) => s + l.amount, 0);
  const balanced = r.opening_balance != null && r.closing_balance != null ? Math.abs(r.opening_balance + sum - r.closing_balance) < 0.02 : null;
  return { lines, closingBalance: r.closing_balance ?? null, balanced };
}

// ── Tax year ───────────────────────────────────────────────────────────

export interface TaxYear {
  year: string;
  rents: number; otherIncome: number;
  mortgageInterest: number; interestFrom1098: boolean; interestEstimate: number;
  taxes: number; insurance: number; utilitiesPaid: number; recharges: number; utilitiesNet: number;
  repairs: number; bankFees: number; other: number; totalExpenses: number; net: number;
  mortgagePaid: number;
  cash: { in: number; out: number; net: number };
  owner: { contributions: number; draws: number };
  note: { payments: number; interest: number; principal: number } | null;
  share: { pct: number; net: number } | null;
  docs: { name: string; done: boolean; note: string }[];
  monthsClosed: number; monthsWithIssues: number;
}

export async function taxYear(p: PersonalProperty, year: string): Promise<TaxYear> {
  const tx = await all<PersonalTx>("SELECT * FROM personal_transactions WHERE property_id = ? AND substr(date, 1, 4) = ?", [p.id, year]);
  const sum = (f: (t: PersonalTx) => boolean) => round2(tx.filter(f).reduce((s, t) => s + t.amount, 0));
  const inc = (c: string) => sum(t => t.type === 'Income' && t.category === c);
  const exp = (c: string) => sum(t => t.type === 'Expense' && t.category === c);
  const row = await get<{ mortgage_interest: number | null; docs: string | null }>('SELECT mortgage_interest, docs FROM personal_tax_years WHERE property_id = ? AND year = ?', [p.id, year]);

  const rents = inc('Rent'), otherIncome = inc('Other');
  const recharges = sum(t => t.type === 'Income' && UTILITY_CATEGORIES.has(t.category));
  const utilitiesPaid = sum(t => t.type === 'Expense' && UTILITY_CATEGORIES.has(t.category));
  // Until the 1098 arrives: a year of interest on the current balance at the loan rate.
  const interestEstimate = round2((p.loan_balance || 0) * ((p.loan_rate || 0) / 100));
  const mortgageInterest = row?.mortgage_interest ?? interestEstimate;
  const taxes = exp('Property tax'), insurance = exp('Insurance'), repairs = exp('Maintenance'), bankFees = exp('Bank fees'), other = exp('Other');
  const utilitiesNet = round2(utilitiesPaid - recharges);
  const totalExpenses = round2(mortgageInterest + taxes + insurance + utilitiesNet + repairs + bankFees + other);
  const net = round2(rents + otherIncome - totalExpenses);

  const bank = (t: PersonalTx) => !NON_OPERATING.has(t.category) && !ESCROW_SOURCES.has(t.source || '') && t.category !== 'Dan payback';
  const cashIn = sum(t => t.type === 'Income' && bank(t)), cashOut = sum(t => t.type === 'Expense' && bank(t));

  let note: TaxYear['note'] = null;
  if (p.slug === 'emerson') {
    const n = await get<{ c: number; i: number; pr: number }>("SELECT COUNT(*) AS c, SUM(interest) AS i, SUM(principal) AS pr FROM personal_note_payments WHERE substr(date, 1, 4) = ?", [year]);
    note = { payments: Number(n?.c || 0), interest: round2(Number(n?.i || 0)), principal: round2(Number(n?.pr || 0)) };
  }
  const share = p.slug === 'clayton' ? { pct: 21.9, net: round2(net * 0.219) } : null;

  const saved = (() => { try { return row?.docs ? JSON.parse(row.docs) as Record<string, { done?: boolean; note?: string }> : {}; } catch { return {}; } })();
  const docs = taxDocList(p.slug).map(name => ({ name, done: !!saved[name]?.done, note: saved[name]?.note || '' }));

  const months = await auditYear(p, year);
  return {
    year, rents, otherIncome, mortgageInterest, interestFrom1098: row?.mortgage_interest != null, interestEstimate,
    taxes, insurance, utilitiesPaid, recharges, utilitiesNet, repairs, bankFees, other, totalExpenses, net,
    mortgagePaid: exp('Mortgage'),
    cash: { in: cashIn, out: cashOut, net: round2(cashIn - cashOut) },
    owner: { contributions: inc('Owner contribution'), draws: exp('Owner draw') },
    note, share, docs,
    monthsClosed: months.filter(m => m.state === 'closed').length,
    monthsWithIssues: months.filter(m => m.state === 'issues').length,
  };
}

export async function saveTaxYear(pid: string, year: string, b: { mortgage_interest?: number | null; doc?: string; done?: boolean; note?: string }) {
  const row = await get<{ docs: string | null }>('SELECT docs FROM personal_tax_years WHERE property_id = ? AND year = ?', [pid, year]);
  if (!row) await run('INSERT INTO personal_tax_years (property_id, year) VALUES (?, ?)', [pid, year]);
  if ('mortgage_interest' in b) await run('UPDATE personal_tax_years SET mortgage_interest = ? WHERE property_id = ? AND year = ?', [b.mortgage_interest ?? null, pid, year]);
  if (b.doc) {
    let docs: Record<string, { done?: boolean; note?: string }> = {};
    try { docs = row?.docs ? JSON.parse(row.docs) : {}; } catch { /* reset */ }
    docs[b.doc] = { done: b.done ?? docs[b.doc]?.done ?? false, note: b.note ?? docs[b.doc]?.note ?? '' };
    await run('UPDATE personal_tax_years SET docs = ? WHERE property_id = ? AND year = ?', [JSON.stringify(docs), pid, year]);
  }
}

// ── Dates ──────────────────────────────────────────────────────────────

function shiftDay(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}
const dayDiff = (a: string, b: string) => (Date.parse(a + 'T00:00:00Z') - Date.parse(b + 'T00:00:00Z')) / 86_400_000;
