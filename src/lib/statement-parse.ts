// Bank statement CSVs (Chase, Bank of America, or any export with a date, a description and an
// amount or debit/credit columns). Pure: used by the import route and testable on its own.
// PDFs are read by Claude instead (lib/personal-audit.ts); both produce ParsedStatement.

export interface ParsedLine { date: string; description: string; amount: number; balance: number | null }
export interface ParsedStatement { lines: ParsedLine[]; closingBalance: number | null; balanced: boolean | null }

// A small CSV reader that handles quoted fields with commas and doubled quotes.
export function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', q = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map(r => r.map(x => x.trim())).filter(r => r.some(x => x !== ''));
}

export function money(s: string | undefined | null): number | null {
  if (s == null) return null;
  const t = String(s).trim();
  if (!t) return null;
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t.replace(/^\$/, '')) || /-$/.test(t);
  const n = Number(t.replace(/[()$,\s+-]/g, ''));
  if (!isFinite(n) || !/\d/.test(t)) return null;
  return neg ? -n : n;
}

export function isoDate(s: string | undefined | null): string | null {
  if (!s) return null;
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  return null;
}

const find = (head: string[], ...res: RegExp[]) => { for (const re of res) { const i = head.findIndex(h => re.test(h)); if (i >= 0) return i; } return -1; };

export function parseStatementCsv(text: string): ParsedStatement {
  const rows = csvRows(text);
  // The header is the first row naming a date column and an amount (or debit/credit) column.
  // Bank of America puts a summary block above it.
  const hi = rows.findIndex(r => r.some(c => /date/i.test(c)) && r.some(c => /amount|debit|credit|withdraw|deposit/i.test(c)));
  if (hi < 0) throw new Error("Couldn't find the column headers (a date and an amount column).");
  const head = rows[hi].map(h => h.toLowerCase());
  const di = find(head, /^posting date$/, /^date$/, /transaction date/, /^posted/, /date/);
  const ti = find(head, /^description$/, /description/, /payee/, /memo/, /details/);
  const ai = find(head, /^amount$/, /amount/);
  const debit = find(head, /debit/, /withdraw/);
  const credit = find(head, /credit/, /deposit/);
  const bi = find(head, /running bal/, /balance/);
  if (di < 0 || ti < 0 || (ai < 0 && debit < 0 && credit < 0)) throw new Error('Missing a date, description or amount column.');

  const lines: ParsedLine[] = [];
  for (const r of rows.slice(hi + 1)) {
    const date = isoDate(r[di]);
    if (!date) continue;
    let amount: number | null;
    if (ai >= 0 && ai !== debit && ai !== credit) amount = money(r[ai]);
    else {
      const d = debit >= 0 ? money(r[debit]) : null, c = credit >= 0 ? money(r[credit]) : null;
      amount = d != null || c != null ? (c ? Math.abs(c) : 0) - (d ? Math.abs(d) : 0) : null;
    }
    if (amount == null || amount === 0) continue;     // opening-balance rows and blanks
    const description = (r[ti] || '').replace(/\s+/g, ' ').trim() || '(no description)';
    lines.push({ date, description, amount: Math.round(amount * 100) / 100, balance: bi >= 0 ? money(r[bi]) : null });
  }
  return { lines, ...checkBalances(lines) };
}

// Running balances, when the export has them, prove nothing was dropped: each line's balance
// is the one before plus its amount. Banks list newest-first or oldest-first; both are tried.
export function checkBalances(lines: ParsedLine[]): { closingBalance: number | null; balanced: boolean | null } {
  const withBal = lines.filter(l => l.balance != null);
  if (withBal.length < 2 || withBal.length !== lines.length) return { closingBalance: withBal.length ? newest(withBal).balance : null, balanced: null };
  const ok = (seq: ParsedLine[]) => seq.every((l, i) => i === 0 || Math.abs((seq[i - 1].balance as number) + l.amount - (l.balance as number)) < 0.015);
  const asc = [...lines], desc = [...lines].reverse();
  const balanced = ok(asc) || ok(desc);
  const last = ok(asc) ? asc[asc.length - 1] : ok(desc) ? desc[desc.length - 1] : newest(lines);
  return { closingBalance: last.balance, balanced };
}
const newest = (ls: ParsedLine[]) => ls.reduce((a, b) => (b.date >= a.date ? b : a));

// Same line, same import or not: date, amount, description, and its position among identical
// lines (two $50 transfers on one day are two lines).
export function fingerprints(lines: ParsedLine[]): string[] {
  const seen = new Map<string, number>();
  return lines.map(l => {
    const base = `${l.date}|${l.amount.toFixed(2)}|${l.description.toLowerCase().replace(/\s+/g, ' ')}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return `${base}|${n}`;
  });
}

// The words that identify a payee, for learned rules: "ZELLE FROM LUKE SPRAGUE ON 09/01 REF #8812"
// → "zelle from luke sprague".
export function descriptionKey(d: string): string {
  return d.toLowerCase()
    .replace(/\b(ref|conf|id|trace|ppd|web|ccd|indn)\b.*$/, ' ')
    .replace(/#.*$/, ' ')                       // card purchases: "#1503 DENVER CO" is the store
    .replace(/\s\d{3,}\s.*$/, ' ')               // ... or "05931 LAKEWOOD CO"
    .replace(/\d+/g, ' ')
    .replace(/[^a-z& ]+/g, ' ')
    .replace(/\bdes\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ').slice(0, 4).join(' ');
}
