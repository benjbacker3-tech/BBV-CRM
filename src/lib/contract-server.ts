// Contract dates on the server: apply a deal's PSA terms (lib/contract-terms.ts) to its DD
// expiry, closing date and diligence checklist; find and read its PSA in OneDrive.
import { all, get, run } from './db';
import { Deal } from './utils';
import { OWNERSHIP_SECTION } from './dd-template';
import { checklistDue, readTerms, timeline, Found } from './contract-terms';
import { DriveItem, children, download, graphConfigured } from './graph';
import { findDealFolder } from './deal-docs';

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

export interface PsaRead { file: { name: string; webUrl: string } | null; scanned: boolean; found: Found; error?: string }

export async function readDealPsa(deal: Deal): Promise<PsaRead> {
  const psa = await findPsa(deal);
  if (!psa) return { file: null, scanned: false, found: {} };
  const text = await pdfText(await download(psa.id));
  const scanned = text.replace(/\s/g, '').length < 500;   // a scan has no text layer
  return { file: { name: psa.name, webUrl: psa.webUrl }, scanned, found: scanned ? {} : readTerms(text) };
}
