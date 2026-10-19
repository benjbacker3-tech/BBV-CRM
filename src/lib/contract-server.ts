// Contract dates on the server: apply a deal's PSA terms (lib/contract-terms.ts) to its DD
// expiry, closing date and diligence checklist; find and read its PSA in OneDrive.
import { all, get, run } from './db';
import { Deal } from './utils';
import { OWNERSHIP_SECTION } from './dd-template';
import { checklistDue, readTerms, timeline, Found } from './contract-terms';
import { DriveItem, children, download, graphConfigured } from './graph';
import { findDealFolder } from './deal-docs';
import { aiConfigured, extract, pdfBlock } from './ai';

export const CONTRACT_FIELDS = ['psa_effective', 'dd_days', 'close_days', 'em_days', 'em_business', 'deposit', 'deposit_2'] as const;

// Recompute from the deal's terms: set dd_expiry and close_date, and date every checklist line
// that has no date yet or was dated by an earlier run (due_auto = 1). Lines Ben dated by hand
// are left alone. Does nothing until the PSA effective date is known.
export async function applyContractDates(dealId: number): Promise<{ milestones: ReturnType<typeof timeline>; dated: number }> {
  const d = await get<Deal>('SELECT * FROM deals WHERE id = ?', [dealId]);
  if (!d?.psa_effective) return { milestones: [], dated: 0 };
  const ms = timeline({
    psa_effective: d.psa_effective, dd_days: d.dd_days || null, close_days: d.close_days || null,
    em_days: d.em_days ?? null, em_business: d.em_business ?? null, deposit: d.deposit || null, deposit_2: d.deposit_2 ?? null,
  });
  const dd = ms.find(m => m.key === 'dd')?.date ?? null;
  const close = ms.find(m => m.key === 'close')?.date ?? null;
  if (dd || close) await run('UPDATE deals SET dd_expiry = COALESCE(?, dd_expiry), close_date = COALESCE(?, close_date) WHERE id = ?', [dd, close, dealId]);

  const items = await all<{ id: number; item_key: string; section: string; due_date: string | null; due_auto: number }>(
    "SELECT id, item_key, section, due_date, due_auto FROM dd_items WHERE deal_id = ? AND list = 'dd'", [dealId]);
  let dated = 0;
  for (const it of items) {
    if (it.due_date && !it.due_auto) continue;
    const due = checklistDue(it.item_key, it.section, ms, OWNERSHIP_SECTION);
    if (!due || due === it.due_date) continue;
    await run('UPDATE dd_items SET due_date = ?, due_auto = 1 WHERE id = ?', [due, it.id]);
    dated++;
  }
  return { milestones: ms, dated };
}

const PSA_NAME = /\b(psa|purchase (and|&) sale|sale agreement|purchase agreement|contract to buy|commercial contract|real estate (sale|purchase))\b/i;
const NOT_PSA = /\b(loi|letter of intent|amend|addend|extension|notice|estoppel|assignment|termination)\b/i;

// The deal's PSA: a PDF in its folder (searched two levels down, e.g. "02 LOI & PSA" or
// "Legal") whose name says PSA. Prefers an executed copy, then the newest.
export async function findPsa(deal: Deal): Promise<DriveItem | null> {
  if (!graphConfigured()) return null;
  const folder = await findDealFolder(deal);
  if (!folder) return null;
  const files: DriveItem[] = [];
  const walk = async (id: string, depth: number) => {
    for (const it of await children(id)) {
      if (it.folder && depth > 0) await walk(it.id, depth - 1);
      else if (it.file && /\.pdf$/i.test(it.name) && PSA_NAME.test(it.name) && !NOT_PSA.test(it.name)) files.push(it);
    }
  };
  await walk(folder.id, 2);
  files.sort((a, b) => Number(/execut/i.test(b.name)) - Number(/execut/i.test(a.name)) || b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime));
  return files[0] ?? null;
}

export async function pdfText(bytes: ArrayBuffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join('\n') : text;
}

export interface PsaRead { file: { name: string; webUrl: string } | null; scanned: boolean; found: Found; via?: 'claude' | 'rules'; note?: string; error?: string }

// Claude reads the PDF itself (so signed scans work too); the text rules are the fallback when
// no API key is set, the file is too big to send, or the call fails.
export async function readDealPsa(deal: Deal): Promise<PsaRead> {
  const psa = await findPsa(deal);
  if (!psa) return { file: null, scanned: false, found: {} };
  const bytes = await download(psa.id);
  const file = { name: psa.name, webUrl: psa.webUrl };
  let note: string | undefined;
  if (aiConfigured() && bytes.byteLength < 25 * 1024 * 1024) {
    try {
      return { file, scanned: false, found: await readTermsWithClaude(bytes), via: 'claude' };
    } catch (e) {
      note = `Claude couldn't read it (${e instanceof Error ? e.message : String(e)}); used the text rules instead.`;
    }
  }
  const text = await pdfText(bytes);
  const scanned = text.replace(/\s/g, '').length < 500;   // a scan has no text layer
  return { file, scanned, found: scanned ? {} : readTerms(text), via: 'rules', note };
}

const TERM = (type: 'string' | 'number' | 'boolean', what: string) => ({
  type: ['object', 'null'],
  description: `${what} Null if the contract doesn't state it (a blank form field counts as not stated).`,
  properties: { value: { type }, quote: { type: 'string', description: 'The exact sentence or clause it comes from, under 40 words.' } },
  required: ['value', 'quote'],
});
const PSA_SCHEMA = {
  properties: {
    psa_effective: TERM('string', 'Effective date as YYYY-MM-DD, only if a date is actually filled in.'),
    dd_days: TERM('number', 'Length of the inspection / due diligence / feasibility period, in days after the effective date.'),
    close_days: TERM('number', 'Closing: days after the END of the inspection period.'),
    close_days_after_effective: TERM('number', 'Closing: days after the EFFECTIVE DATE, when the contract counts it that way instead.'),
    em_amount: TERM('number', 'Initial earnest money deposit, in dollars.'),
    em_days: TERM('number', 'Earnest money is due this many days after the effective date.'),
    em_business: TERM('boolean', 'True if the earnest money days are business days.'),
    price: TERM('number', 'Purchase price, in dollars.'),
  },
  required: ['psa_effective', 'dd_days', 'close_days', 'close_days_after_effective', 'em_amount', 'em_days', 'em_business', 'price'],
};

async function readTermsWithClaude(bytes: ArrayBuffer): Promise<Found> {
  const raw = await extract<Record<string, { value: unknown; quote: string } | null>>({
    model: 'careful',
    system: 'You read U.S. commercial real estate purchase and sale agreements and report their key business terms exactly as written. Amendments in the same file override the original terms; use the amended value and quote the amendment. Never guess: if a term is blank or not stated, return null.',
    content: [pdfBlock(bytes), { type: 'text', text: 'Report the key terms of this purchase agreement.' }],
    schema: PSA_SCHEMA,
  });
  const found: Found = {};
  const num = (v: unknown) => (typeof v === 'number' && isFinite(v) && v >= 0 ? v : null);
  for (const [k, t] of Object.entries(raw || {})) {
    if (!t || t.value == null) continue;
    const quote = String(t.quote || '').slice(0, 300);
    if (k === 'psa_effective') { if (typeof t.value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) found.psa_effective = { value: t.value, quote }; }
    else if (k === 'em_business') { if (typeof t.value === 'boolean') found.em_business = { value: t.value, quote }; }
    else if (k in PSA_SCHEMA.properties) { const v = num(t.value); if (v != null) (found as Record<string, unknown>)[k] = { value: v, quote }; }
  }
  return found;
}
