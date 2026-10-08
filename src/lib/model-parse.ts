import ExcelJS from 'exceljs';

// Reads the outputs of an IOS deal model (IOS Model v01 template) from its
// Assumptions tab. Values are located by their labels rather than fixed cells,
// so small layout changes between model versions don't break the read.

export interface ModelOutputs {
  name: string | null;
  address: string | null;
  city: string | null;
  sf: number | null;
  acres: number | null;
  price: number | null;
  capex: number | null;
  allInBasis: number | null;      // Total Project Cost
  equity: number | null;          // Common Equity
  irr: number | null;             // levered IRR
  em: number | null;              // levered equity multiple
  irrUnlevered: number | null;
  irrLp: number | null;
  feeAcq: number | null;
  feeConstruction: number | null; // "Development Fee"
  feeLeasing: number | null;
  feeAm: number | null;           // asset mgmt fee over the hold
  holdMonths: number | null;
  closeDate: string | null;
}

type Sheet = ExcelJS.Worksheet;

const raw = (v: ExcelJS.CellValue): unknown => (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v ? (v as { result: unknown }).result : v);
const numAt = (ws: Sheet, r: number, c: number): number | null => {
  const v = raw(ws.getRow(r).getCell(c).value);
  return typeof v === 'number' && isFinite(v) ? v : null;
};
const textAt = (ws: Sheet, r: number, c: number): string | null => {
  const v = raw(ws.getRow(r).getCell(c).value);
  if (v == null) return null;
  if (typeof v === 'object' && 'richText' in (v as object)) return (v as { richText: { text: string }[] }).richText.map(t => t.text).join('').trim() || null;
  const s = String(v).trim();
  return s || null;
};
const dateAt = (ws: Sheet, r: number, c: number): string | null => {
  const v = raw(ws.getRow(r).getCell(c).value);
  return v instanceof Date && !isNaN(v.getTime()) && v.getUTCFullYear() > 2000 ? v.toISOString().slice(0, 10) : null;
};

// Every cell whose text matches, in reading order.
function findLabels(ws: Sheet, re: RegExp, maxRow = 60): { r: number; c: number }[] {
  const out: { r: number; c: number }[] = [];
  for (let r = 1; r <= Math.min(ws.rowCount, maxRow); r++) {
    const row = ws.getRow(r);
    for (let c = 1; c <= Math.min(ws.columnCount, 40); c++) {
      const v = row.getCell(c).value;
      if (typeof v === 'string' && re.test(v.trim())) out.push({ r, c });
    }
  }
  return out;
}

// First number to the right of a label (within `span` columns).
function rightOf(ws: Sheet, at: { r: number; c: number } | undefined, span = 4): number | null {
  if (!at) return null;
  for (let d = 1; d <= span; d++) {
    const n = numAt(ws, at.r, at.c + d);
    if (n != null) return n;
  }
  return null;
}

// First dollar amount to the right of a label, skipping rate cells like 1.5% (sponsor fee rows
// hold the rate first, then the $).
function dollarsRightOf(ws: Sheet, at: { r: number; c: number } | undefined, span = 4): number | null {
  if (!at) return null;
  for (let d = 1; d <= span; d++) {
    const n = numAt(ws, at.r, at.c + d);
    if (n != null && Math.abs(n) >= 100) return n;
  }
  return null;
}

// Within a returns block (e.g. "Levered Returns"), the IRR and EM rows that follow it.
// The same heading text can appear elsewhere ("Limited Partner" in Sources), so use the
// occurrence that actually has an IRR row beneath it.
function returnsBlock(ws: Sheet, heading: RegExp) {
  const irrs = findLabels(ws, /^internal rate of return/i);
  const ems = findLabels(ws, /^equity multiple/i);
  for (const h of findLabels(ws, heading)) {
    const irr = irrs.find(p => p.c === h.c && p.r > h.r && p.r <= h.r + 3);
    if (!irr) continue;
    const em = ems.find(p => p.c === h.c && p.r > h.r && p.r <= h.r + 4);
    return { irr: rightOf(ws, irr), em: rightOf(ws, em) };
  }
  return { irr: null, em: null };
}

export async function parseModel(data: ArrayBuffer | Buffer): Promise<ModelOutputs | null> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(data as never);
  const ws = wb.getWorksheet('Assumptions');
  if (!ws) return null;

  const first = (re: RegExp) => findLabels(ws, re)[0];
  // "Property" block in column B: label in B, value in D
  const prop = (re: RegExp) => { const at = first(re); return at ? { r: at.r, c: at.c } : undefined; };
  const propText = (re: RegExp) => { const at = prop(re); if (!at) return null; for (let d = 1; d <= 3; d++) { const t = textAt(ws, at.r, at.c + d); if (t) return t; } return null; };

  const totalCost = first(/^total project cost/i);
  if (!totalCost && !first(/^levered returns/i)) return null; // not an IOS model

  const lev = returnsBlock(ws, /^levered returns/i);
  const unlev = returnsBlock(ws, /^unlevered returns/i);
  const lp = returnsBlock(ws, /^limited partner$/i);

  const closeLabel = first(/^close date$/i);
  const saleMonth = first(/^sale month$/i);

  return {
    name: propText(/^name$/i),
    address: propText(/^address$/i),
    city: propText(/^city$/i),
    sf: rightOf(ws, prop(/^building sf$/i), 2),
    acres: rightOf(ws, prop(/^acres$/i), 2),
    price: rightOf(ws, first(/^purchase$/i), 3),
    capex: rightOf(ws, first(/^hard costs$/i), 3),
    allInBasis: rightOf(ws, totalCost, 3),
    equity: rightOf(ws, first(/^common equity$/i), 3),
    irr: lev.irr,
    em: lev.em,
    irrUnlevered: unlev.irr,
    irrLp: lp.irr,
    feeAcq: dollarsRightOf(ws, findLabels(ws, /^acquisition fee$/i).find(p => p.c > 10)),
    feeConstruction: dollarsRightOf(ws, findLabels(ws, /^development fee$/i).find(p => p.c > 10)),
    feeLeasing: dollarsRightOf(ws, findLabels(ws, /^leasing fee$/i).find(p => p.c > 10)),
    feeAm: dollarsRightOf(ws, findLabels(ws, /^asset mgmt\.? fee$/i).find(p => p.c > 10)),
    // "Sale Month" row: a date in the next column, then the month count
    holdMonths: saleMonth ? (() => { for (let d = 1; d <= 4; d++) { const n = numAt(ws, saleMonth.r, saleMonth.c + d); if (n != null && n > 0 && n < 400) return n; } return null; })() : null,
    closeDate: closeLabel ? (dateAt(ws, closeLabel.r, closeLabel.c + 2) ?? dateAt(ws, closeLabel.r, closeLabel.c + 1)) : null,
  };
}

// Deal fields a model sync writes. Purchase price is left alone: the pipeline
// price tracks the LOI/PSA, not whatever the latest underwriting assumed.
export function modelToDealPatch(m: ModelOutputs) {
  return {
    irr: m.irr,
    em: m.em,
    all_in_basis: m.allInBasis,
    equity_required: m.equity,
    fee_acq: m.feeAcq,
    fee_construction: m.feeConstruction,
    fee_leasing: m.feeLeasing,
    fee_am: m.feeAm,
    hold_months: m.holdMonths,
  };
}

// "1962 Ives WA - 09 23 2026.xlsm" → 2026-09-23 (null when the date in the name is invalid)
export function dateFromFilename(name: string): string | null {
  const m = name.match(/(\d{1,2})\s+(\d{1,2})\s+(\d{4})/);
  if (!m) return null;
  const [mo, d, y] = [+m[1], +m[2], +m[3]];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// Street number + first street word, for matching deals to files and folders:
// "1862 Ives, Kent, WA" → { num: '1862', street: 'ives' }; "Equipment Shop — Tacoma" → null
export function addressKey(s: string): { num: string; street: string } | null {
  const m = s.toLowerCase().match(/^\s*(\d+)\s+(?:[nsew]\.?\s+)?([a-z0-9][a-z0-9-]*)/);
  return m ? { num: m[1], street: m[2] } : null;
}

// At most one inserted, deleted or changed character ("Lossee" vs "Losee").
function oneEditApart(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

// Same property, allowing one typo: either the street name is one letter off
// (4+ letter names, e.g. "3033 Lossee"), or the street number has one wrong digit
// with the street name exact (e.g. "1962 Ives" for 1862 Ives). Never both.
export function sameAddress(a: string, b: string): boolean {
  const ka = addressKey(a), kb = addressKey(b);
  if (!ka || !kb) return false;
  if (ka.num === kb.num) {
    return ka.street === kb.street || (Math.min(ka.street.length, kb.street.length) >= 4 && oneEditApart(ka.street, kb.street));
  }
  if (ka.street !== kb.street || ka.num.length !== kb.num.length) return false;
  let diff = 0;
  for (let i = 0; i < ka.num.length; i++) if (ka.num[i] !== kb.num[i]) diff++;
  return diff === 1;
}
