// Reading key dates and money terms from a PSA's text, and turning contract terms into a
// timeline. Pure (no server imports): used by /api/deals/[id]/psa and the Contract dates card.
//
// Reading is best-effort. Custom PSAs state terms in sentences ("Within five (5) business days
// after the Effective Date, Purchaser shall deposit ... ($75,000.00)") and read well. State
// forms (Colorado CBS3, Texas TREC) keep the numbers in fill-in fields that often don't come
// through as text, and signed scans have no text at all; those terms are entered by hand.
// Every suggestion carries the sentence it came from so Ben can check it before applying.

export interface ContractTerms {
  psa_effective: string | null;        // YYYY-MM-DD
  dd_days: number | null;              // inspection / due diligence period, days after effective
  close_days: number | null;           // closing, days after DD expiry
  close_days_after_effective: number | null; // when closing is counted from the effective date instead
  em_amount: number | null;            // initial earnest money
  em_days: number | null;              // due this many days after effective
  em_business: boolean | null;         // ... counted in business days
  price: number | null;
}
export type Found = { [K in keyof ContractTerms]?: { value: ContractTerms[K]; quote: string } };

const MONTHS = 'January|February|March|April|May|June|July|August|September|October|November|December';
const money = (s: string) => Number(s.replace(/[,$\s]/g, ''));
const clip = (text: string, i: number, len: number) => text.slice(Math.max(0, i - 40), Math.min(text.length, i + len + 40)).trim();

function isoFrom(s: string): string | null {
  const m = s.match(new RegExp(`(${MONTHS})\\s+(\\d{1,2}),?\\s+(20\\d\\d)`, 'i'));
  if (m) {
    const mo = MONTHS.split('|').findIndex(x => x.toLowerCase() === m[1].toLowerCase()) + 1;
    return `${m[3]}-${String(mo).padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  const n = s.match(/(\d{1,2})\/(\d{1,2})\/(20\d\d)/);
  return n ? `${n[3]}-${n[1].padStart(2, '0')}-${n[2].padStart(2, '0')}` : null;
}

// A day count written either way: "thirty (30) days", "thirtieth (30th) day", "45 days". A
// parenthesized number must follow a word, so list markers like "(1) days" (a blank form
// field after item 1) don't count.
const DAYS = String.raw`(?:[a-z-]+\s+\((\d{1,3})(?:st|nd|rd|th)?\)|\b(\d{1,3}))\s*(calendar\s+|business\s+)?days?\b`;
const daysOf = (m: RegExpMatchArray, at = 1) => Number(m[at] ?? m[at + 1]);

export function readTerms(raw: string): Found {
  const text = raw.replace(/\s+/g, ' ');
  const found: Found = {};
  const hit = <K extends keyof ContractTerms>(k: K, value: ContractTerms[K], m: RegExpMatchArray) => {
    if (found[k] === undefined && value !== null && !(typeof value === 'number' && !isFinite(value))) {
      found[k] = { value, quote: clip(text, m.index ?? 0, m[0].length) } as Found[K];
    }
  };

  // Inspection / due diligence / feasibility period. Best: where the term is defined, e.g.
  // "The period beginning on the Effective Date and ending sixty (60) days thereafter (the
  // 'Inspection Period')": take the last day count in the sentence before the definition.
  const PERIOD = '(?:inspection|due diligence|feasibility|study|review|investigation|option)\\s+period';
  for (const def of Array.from(text.matchAll(new RegExp(`\\(\\s*(?:the\\s+)?["“]${PERIOD}["”]\\s*\\)`, 'gi')))) {
    const start = Math.max(0, (def.index ?? 0) - 300);
    const before = text.slice(start, def.index).split(/\.\s/).pop() || '';
    const counts = Array.from(before.matchAll(new RegExp(DAYS, 'gi')));
    if (counts.length) {
      const last = counts[counts.length - 1];
      hit('dd_days', daysOf(last), Object.assign([def[0]], { index: start + (before === '' ? 0 : text.slice(start, def.index).lastIndexOf(before)) }) as unknown as RegExpMatchArray);
      if (found.dd_days) found.dd_days.quote = (before + ' ' + def[0]).trim().slice(-260);
      break;
    }
  }
  if (!found.dd_days) {
    const m = text.match(new RegExp(String.raw`${PERIOD}\s+(?:shall\s+)?(?:mean|be|is|expire|end)s?\s+(?:on\s+)?(?:the\s+)?(?:period\s+)?(?:of\s+)?(?:beginning[^.]{0,80}?ending\s+)?${DAYS}`, 'i'));
    if (m) hit('dd_days', daysOf(m), m);
  }

  // Closing: N days after the end of the inspection period, or after the effective date.
  const afterDd = text.match(new RegExp(String.raw`clos(?:e|ing)[^.]{0,160}?${DAYS}\s+(?:following|after)\s+(?:the\s+)?(?:expiration|end|expiry|lapse)\s+of\s+the\s+(?:inspection|due diligence|feasibility|study|review)`, 'i'));
  if (afterDd) hit('close_days', daysOf(afterDd), afterDd);
  else {
    const afterEff = text.match(new RegExp(String.raw`clos(?:e|ing)\s+(?:shall|will)\s+(?:occur|take place|be held)[^.]{0,120}?${DAYS}\s+(?:following|after)\s+the\s+effective\s+date`, 'i'));
    if (afterEff) hit('close_days_after_effective', daysOf(afterEff), afterEff);
  }

  // Earnest money: "Within five (5) business days after the Effective Date, Purchaser shall deposit ... ($75,000.00)".
  const em = text.match(new RegExp(String.raw`within\s+${DAYS}\s+(?:after|following)\s+the\s+effective\s+date,?\s+(?:purchaser|buyer)\s+shall\s+deposit[^$]{0,160}?\$\s?([\d,]+(?:\.\d{2})?)`, 'i'));
  if (em) {
    hit('em_days', daysOf(em), em);
    hit('em_business', /business/i.test(em[3] || ''), em);
    hit('em_amount', money(em[4]), em);
  } else {
    const em2 = text.match(/\$\s?([\d,]{4,}(?:\.\d{2})?)\)?[^.]{0,80}?["“(]+\s*(?:the\s+)?["“]?(?:initial\s+)?(?:earnest money|deposit)["”]/i);
    if (em2) hit('em_amount', money(em2[1]), em2);
  }

  // Purchase price: "a purchase price of Three Million ... ($3,600,000.00)".
  const price = text.match(/purchase price (?:of|shall be|is|equal to)[^$]{0,200}?\$\s?([\d,]{5,}(?:\.\d{2})?)/i);
  if (price) hit('price', money(price[1]), price);

  // Effective date, when it's actually filled in.
  const eff = text.match(new RegExp(`(?:effective date[^.]{0,20}(?:is|shall be|means|:)|made and entered into as of|dated as of)\\s+(?:the\\s+)?[^.]{0,40}?((?:${MONTHS})\\s+\\d{1,2},?\\s+20\\d\\d|\\d{1,2}/\\d{1,2}/20\\d\\d)`, 'i'));
  if (eff) hit('psa_effective', isoFrom(eff[1]), eff);

  return found;
}

// ── Timeline ────────────────────────────────────────────────────────────────

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const parse = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;
// Deadlines on a weekend move to the next business day (the usual PSA rule).
export function rollForward(s: string): string { const d = parse(s); while (isWeekend(d)) d.setDate(d.getDate() + 1); return iso(d); }
export function addDays(s: string, n: number): string { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); }
export function addBusinessDays(s: string, n: number): string {
  const d = parse(s);
  let left = n;
  while (left > 0) { d.setDate(d.getDate() + 1); if (!isWeekend(d)) left--; }
  return iso(d);
}

export interface DealTerms {
  psa_effective: string | null; dd_days: number | null; close_days: number | null;
  em_days: number | null; em_business: number | null; deposit: number | null; deposit_2: number | null;
}
export interface Milestone { key: 'effective' | 'em' | 'dd' | 'deposit2' | 'close'; label: string; date: string; amount?: number | null }

// The contract's dates from its terms; empty until the effective date is known.
export function timeline(t: DealTerms): Milestone[] {
  if (!t.psa_effective) return [];
  const out: Milestone[] = [{ key: 'effective', label: 'PSA effective', date: t.psa_effective }];
  if (t.em_days != null) {
    const due = t.em_business ? addBusinessDays(t.psa_effective, t.em_days) : rollForward(addDays(t.psa_effective, t.em_days));
    out.push({ key: 'em', label: 'Earnest money due', date: due, amount: t.deposit });
  }
  if (t.dd_days) {
    const dd = rollForward(addDays(t.psa_effective, t.dd_days));
    out.push({ key: 'dd', label: 'DD expires (deposit goes hard)', date: dd });
    if (t.deposit_2) out.push({ key: 'deposit2', label: 'Additional deposit due', date: dd, amount: t.deposit_2 });
    if (t.close_days) out.push({ key: 'close', label: 'Closing', date: rollForward(addDays(dd, t.close_days)) });
  }
  return out;
}

// When each diligence checklist line is due, relative to the contract's milestones.
// [item key, anchor, days (negative = before)]; business-day offsets are marked 'bd'.
export const CHECKLIST_DUE: [key: string, anchor: 'effective' | 'em' | 'dd' | 'close', days: number, bd?: 'bd'][] = [
  ['critical_dates', 'effective', 1],
  ['legal_kickoff', 'effective', 1],
  ['dd_kickoff', 'effective', 2],
  ['debt_kickoff', 'effective', 3],
  ['em_deposit', 'em', 0],
  ['schedule_reports', 'effective', 3],
  ['ownership_materials', 'effective', 5, 'bd'],
  ['esa', 'dd', -10], ['pca', 'dd', -10], ['survey', 'dd', -10], ['title', 'dd', -10],
  ['roof', 'dd', -10], ['contractor', 'dd', -10], ['zoning', 'dd', -10],
  ['tax', 'dd', -7], ['insurance', 'dd', -7], ['lease_abstracts', 'dd', -7], ['estoppels', 'dd', -7],
  ['tenant_financials', 'dd', -14], ['tenant_interview', 'dd', -14],
  ['construction_budget', 'dd', -5],
  ['equity_approval', 'dd', -3],
  ['lender', 'close', -10],
  ['service_agreements', 'close', -7], ['property_mgmt', 'close', -5], ['dd_broker_invoices', 'close', -5],
  ['settlement', 'close', -3], ['final_wire', 'close', -1],
];
// Ownership-materials lines are all due when the seller's deliveries are (5 business days).
export const OWNERSHIP_DUE: ['effective', number, 'bd'] = ['effective', 5, 'bd'];

export function checklistDue(key: string, section: string, ms: Milestone[], ownershipSection: string): string | null {
  const at = (a: string) => ms.find(m => m.key === a)?.date ?? null;
  if (section === ownershipSection) { const e = at('effective'); return e ? addBusinessDays(e, OWNERSHIP_DUE[1]) : null; }
  const rule = CHECKLIST_DUE.find(r => r[0] === key);
  if (!rule) return null;
  const base = at(rule[1]);
  if (!base) return null;
  if (rule[3] === 'bd') return addBusinessDays(base, rule[2]);
  // Work due before a milestone lands on the business day before a weekend; work due after,
  // on the business day after.
  return rule[2] < 0 ? rollBack(addDays(base, rule[2])) : rollForward(addDays(base, rule[2]));
}

export function rollBack(s: string): string { const d = parse(s); while (isWeekend(d)) d.setDate(d.getDate() - 1); return iso(d); }
