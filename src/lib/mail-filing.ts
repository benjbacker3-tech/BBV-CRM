// Email attachment filing. Scans Ben's mailbox (received and sent) for messages with
// attachments and saves them into OneDrive:
//
//   Deal documents → the deal's folder, in the standard subfolder (categoryOf, or the
//   email subject when the file name doesn't say). A deal is recognised by street
//   number + street, a street name or property LLC ("Verona IOS") unique to one deal,
//   or a thread already filed to it. Deals at Tracking / LOI have no folder yet and are
//   skipped; Dead deals are filed only if their folder exists.
//   Company documents → Formation, Investor Update, Accounting, Market Info, … (see
//   company-folders.ts).
//   Review: anything it isn't sure about. Skipped: signatures, invites, mail reports,
//   and attachments with nothing to go on.
//
// Each decision records the rules version; when the rules improve, review and skipped
// items are re-checked (recheckMail). Filed and dismissed items are never revisited.

import { all, get, run } from './db';
import { Deal } from './utils';
import { STANDARD_SUBFOLDERS, findDealFolder, DocsContext } from './deal-docs';
import { categoryOf, organizeDeal } from './cleanup';
import { sameAddress } from './model-parse';
import { COMPANY_FOLDERS, companyNoise, offeringByAddress, strongCompanyFolder, weakCompanyFolder } from './company-folders';
import {
  DriveItem, MailAttachment, MailMessage, attachmentBytes, children, createFolder, ensureFolderPath,
  messageAttachments, messageById, messagesWithAttachments, uploadBytes,
} from './graph';

export const FOLDER_STAGES = ['Negotiating PSA', 'Under Contract', 'Closed'];
export const RULES_VERSION = 2;
const FIRST_SCAN_DAYS = 14;
const WATERMARK_KEY = 'mail_filing_since';

export interface EmailFile {
  id: number;
  message_id: string;
  attachment_id: string;
  conversation_id: string | null;
  received_at: string;
  sender: string | null;
  subject: string | null;
  web_link: string | null;
  file_name: string;
  size: number | null;
  deal_id: number | null;
  folder: string | null;
  status: 'filed' | 'review' | 'dismissed' | 'skipped';
  reason: string | null;
  drive_item_id: string | null;
  drive_web_url: string | null;
  filed_at: string | null;
  rules_version: number;
}

// Attachments that are never documents.
const NOISE_REASONS = ['Not a file (forwarded email or cloud link)', 'Inline image', 'Invite, contact card or signature', 'Small image (likely a logo or signature)'];
function noise(a: MailAttachment): string | null {
  const n = a.name.toLowerCase();
  if (a['@odata.type'] !== '#microsoft.graph.fileAttachment') return NOISE_REASONS[0];
  if (a.isInline) return NOISE_REASONS[1];
  if (/\.(ics|vcf|p7s|p7m)$/.test(n) || n === 'winmail.dat') return NOISE_REASONS[2];
  if (/\.(png|jpe?g|gif|bmp|emz|wmz)$/.test(n) && (a.size < 100 * 1024 || /^(image|outlook-|att)\d*/.test(n))) return NOISE_REASONS[3];
  return null;
}

// "1862 Ives Ave", "10275 E 106th" … anywhere in free text.
const ADDRESS_RE = /\b(\d{2,6})\s+(?:[nsew]\.?\s+)?([a-z0-9][a-z0-9-]*)/gi;
function addressCandidates(text: string): string[] {
  const out: string[] = [];
  for (const m of Array.from(text.matchAll(ADDRESS_RE))) out.push(`${m[1]} ${m[2]}`);
  return out;
}

const label = (d: Deal) => d.address || d.name;
const streetOf = (d: Deal) => (label(d).toLowerCase().match(/^\s*\d+\s+(?:[nsew]\.?\s+)?([a-z][a-z-]{3,})/)?.[1]) ?? null;
// Property LLCs named in deal notes ("Owner: Verona IOS LLC", "form Brighton IOS LLC").
const entitiesOf = (d: Deal) => Array.from((d.notes || '').matchAll(/\b([A-Z][A-Za-z0-9]+) IOS LLC\b/g), m => `${m[1].toLowerCase()} ios`);

// Subfolder from the file name; when the name doesn't say, the email subject decides if
// it's clear (contractor COIs and W-9s on a GC thread, an exhibit on a PSA thread).
const SUBJECT_RULES: [RegExp, string][] = [
  [/construction|\bgc\b|general contractor|contractor|pay app|\bdraw\b|lien waiver|change order|\broof|permit/, '09 Construction'],
  [/\bloan\b|lender|appraisal|term sheet|financing|\bdebt\b|\bbank\b/, '04 Debt'],
  [/\bpsa\b|purchase (and|&) sale|purchase agreement|\bloi\b|letter of intent|earnest money|amendment|commission agreement|listing agreement/, '02 LOI & PSA'],
  [/\btitle\b|survey|\balta\b|phase i|\besa\b|environmental|zoning|\bpzr\b|geotech|due diligence|\bdd\b|inspection/, '03 Diligence'],
  [/closing|settlement statement|wire instructions|escrow/, '06 Closing'],
  [/\blease\b|tenant|estoppel|\bsnda\b|insurance|property tax|\btaxes\b|tax estimate|property management|\bpma\b|rent roll/, '07 Leasing & Mgmt'],
  [/\bjv\b|joint venture|operating agreement|org chart|capital call|investor|equity/, '05 Equity'],
  [/\bom\b|offering memo|brochure|site plan|drone|photos/, '08 Property Info'],
];

function mailCategory(name: string, subject: string | null): string | null {
  const cat = categoryOf(name, false);
  const s = (subject || '').toLowerCase();
  const fromSubject = SUBJECT_RULES.filter(([re]) => re.test(s)).map(([, f]) => f);
  if (fromSubject[0] === '09 Construction' && /\bcoi\b|certificate of insurance/i.test(name)) return '09 Construction';
  if (cat) return cat;
  // Only when the subject points one way; "PSA + loan" threads go to review.
  return new Set(fromSubject).size === 1 ? fromSubject[0] : null;
}

interface Match { deal: Deal | null; how: 'address' | 'entity' | 'thread' | 'street' | 'city' | 'several' | 'none'; inName?: boolean; others?: Deal[] }

async function matchDeal(msg: MailMessage, att: MailAttachment, deals: Deal[], fileable: (d: Deal) => boolean): Promise<Match> {
  const text = `${msg.subject || ''}\n${att.name}\n${msg.bodyPreview || ''}`;
  const nameCands = addressCandidates(att.name);
  const named = (d: Deal) => nameCands.some(c => sameAddress(c, label(d)));
  const cands = addressCandidates(text);
  const hits = deals.filter(d => cands.some(c => sameAddress(c, label(d))));
  if (hits.length === 1) return { deal: hits[0], how: 'address', inName: named(hits[0]) };
  if (hits.length > 1) {
    // Prefer the deal named in the file name itself.
    const inName = hits.filter(named);
    if (inName.length === 1) return { deal: inName[0], how: 'address', inName: true };
    return { deal: null, how: 'several', others: hits };
  }
  const lower = text.toLowerCase();
  const byEntity = deals.filter(d => entitiesOf(d).some(e => lower.includes(e)));
  if (byEntity.length === 1) return { deal: byEntity[0], how: 'entity', inName: entitiesOf(byEntity[0]).some(e => att.name.toLowerCase().includes(e)) };
  if (msg.conversationId) {
    const prior = await get<{ deal_id: number }>(
      "SELECT deal_id FROM email_files WHERE conversation_id = ? AND status = 'filed' AND deal_id IS NOT NULL GROUP BY deal_id ORDER BY COUNT(*) DESC LIMIT 1",
      [msg.conversationId],
    );
    const d = prior && deals.find(x => x.id === prior.deal_id);
    if (d) return { deal: d, how: 'thread' };
  }
  // Street name alone ("Nesbitt Rd - Roof Timing"): counts when no other deal shares it.
  const head = `${msg.subject || ''} ${att.name}`.toLowerCase();
  const byStreet = deals.filter(d => { const s = streetOf(d); return s && new RegExp(`\\b${s}\\b`).test(head); });
  if (byStreet.length === 1 && deals.filter(d => streetOf(d) === streetOf(byStreet[0])).length === 1) {
    return { deal: byStreet[0], how: 'street', inName: new RegExp(`\\b${streetOf(byStreet[0])}\\b`).test(att.name.toLowerCase()) };
  }
  // City alone ("Sandpiper Brighton - term sheet"): a suggestion when exactly one deal
  // with a folder is in that city.
  const subj = (msg.subject || '').toLowerCase();
  const byCity = deals.filter(d => fileable(d) && d.city && new RegExp(`\\b${d.city.toLowerCase().replace(/[^a-z ]/g, '')}\\b`).test(subj));
  if (byCity.length === 1) return { deal: byCity[0], how: 'city' };
  return { deal: null, how: 'none' };
}

// Deal folder, created (with its standard subfolders) when the deal is at a folder stage.
async function dealFolder(deal: Deal, ctx: DocsContext): Promise<DriveItem | null> {
  const found = await findDealFolder(deal, ctx);
  if (found || !FOLDER_STAGES.includes(deal.stage)) return found;
  await organizeDeal(deal.id);
  return findDealFolder(deal, new DocsContext());
}

type Rec = { message_id: string; attachment_id: string; file_name: string };
const folderCache = new Map<string, DriveItem[]>();

// Save into a folder unless a file with the same name and bytes is already there.
async function saveInto(folder: DriveItem, rec: Rec): Promise<{ item: DriveItem; existing: boolean }> {
  if (!folderCache.has(folder.id)) folderCache.set(folder.id, await children(folder.id));
  const there = folderCache.get(folder.id)!;
  // Outlook's attachment size includes metadata, so compare the downloaded bytes.
  const bytes = await attachmentBytes(rec.message_id, rec.attachment_id);
  const same = there.find(i => i.file && i.name.toLowerCase() === rec.file_name.replace(/[\\/:*?"<>|]/g, '-').toLowerCase() && i.size === bytes.byteLength);
  if (same) return { item: same, existing: true };
  const item = await uploadBytes(folder.id, rec.file_name, bytes);
  there.push(item);
  return { item, existing: false };
}

async function saveToDeal(deal: Deal, folder: string, rec: Rec, ctx: DocsContext) {
  const root = await dealFolder(deal, ctx);
  if (!root) throw new Error(`${label(deal)} has no OneDrive folder`);
  const saved = await saveInto(folder === '' ? root : await createFolder(root.id, folder), rec);
  if (deal.drive_folder_id !== root.id) {
    const parentPath = root.parentReference?.path?.split('root:')[1] ?? '';
    await run('UPDATE deals SET drive_folder_id = ?, drive_folder_path = ? WHERE id = ?', [root.id, `${parentPath}/${root.name}`, deal.id]);
  }
  return saved;
}

const companyFolderIds = new Map<string, DriveItem>();
async function saveToCompany(path: string, rec: Rec) {
  if (!companyFolderIds.has(path)) companyFolderIds.set(path, await ensureFolderPath(path));
  return saveInto(companyFolderIds.get(path)!, rec);
}

interface Ctx {
  deals: Deal[];
  docs: DocsContext;
  deadWithFolder: Set<number>;
  counts: { filed: number; review: number; skipped: number };
}

async function loadCtx(): Promise<Ctx> {
  const deals = await all<Deal>('SELECT * FROM deals');
  const docs = new DocsContext();
  const deadWithFolder = new Set<number>();
  for (const d of deals.filter(x => x.stage === 'Dead')) if (await findDealFolder(d, docs)) deadWithFolder.add(d.id);
  folderCache.clear();
  companyFolderIds.clear();
  return { deals, docs, deadWithFolder, counts: { filed: 0, review: 0, skipped: 0 } };
}

const fileableIn = (c: Ctx) => (d: Deal) => FOLDER_STAGES.includes(d.stage) || c.deadWithFolder.has(d.id);

// Decide and record one attachment (insert, or update an earlier review/skipped decision).
async function processAttachment(msg: MailMessage, att: MailAttachment, c: Ctx) {
  const sender = msg.from?.emailAddress ? `${msg.from.emailAddress.name || ''} <${msg.from.emailAddress.address || ''}>`.trim() : null;
  const base = {
    message_id: msg.id, attachment_id: att.id, conversation_id: msg.conversationId, received_at: msg.receivedDateTime,
    sender, subject: msg.subject, web_link: msg.webLink, file_name: att.name, size: att.size,
  };
  const record = (status: EmailFile['status'], reason: string, extra: Partial<EmailFile> = {}) => {
    if (status === 'filed') c.counts.filed++; else if (status === 'review') c.counts.review++; else c.counts.skipped++;
    const row: Record<string, string | number | null> = {
      ...base, status, reason, deal_id: null, folder: null, drive_item_id: null, drive_web_url: null, filed_at: null, rules_version: RULES_VERSION,
      ...(extra as Record<string, string | number | null>),
    };
    const keys = Object.keys(row);
    const updatable = keys.filter(k => k !== 'message_id' && k !== 'attachment_id');
    return run(
      `INSERT INTO email_files (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})
       ON CONFLICT(message_id, attachment_id) DO UPDATE SET ${updatable.map(k => `${k} = excluded.${k}`).join(', ')}
       WHERE email_files.status IN ('review', 'skipped')`,
      keys.map(k => row[k]),
    );
  };
  const filedNow = (item: DriveItem, existing: boolean, reason: string, extra: Partial<EmailFile>) =>
    record('filed', existing ? 'Already in the folder' : reason, { ...extra, drive_item_id: item.id, drive_web_url: item.webUrl, filed_at: new Date().toISOString() });

  const junk = noise(att) ?? companyNoise(att.name, sender);
  if (junk) return record('skipped', junk);

  const fileable = fileableIn(c);
  const cat = mailCategory(att.name, msg.subject);
  const strong = strongCompanyFolder(att.name);
  const m = await matchDeal(msg, att, c.deals, fileable);

  const toCompany = async (path: string, why: string) => {
    try {
      const { item, existing } = await saveToCompany(path, base);
      return filedNow(item, existing, why, { folder: path });
    } catch (e) {
      return record('review', `Saving to ${path} failed: ${e instanceof Error ? e.message : String(e)}`, { folder: path });
    }
  };

  // Company documents named as such (investor decks, banking forms, engagement letters…),
  // unless the file name itself names a deal.
  if (strong && !(m.deal && m.inName)) return toCompany(strong, 'Company document');

  if (m.deal && m.how !== 'city') {
    const d = m.deal;
    const how = m.how === 'thread' ? ' (same email thread)' : m.how === 'street' ? ` (mentions ${streetOf(d)})` : m.how === 'entity' ? ' (property LLC)' : '';
    if (!fileable(d)) {
      return record('skipped', d.stage === 'Dead' ? `${label(d)} is Dead and has no folder` : `${label(d)} is ${d.stage}; no folder until the LOI is accepted`, { deal_id: d.id, folder: cat });
    }
    if (!cat) return record('review', `Matched ${label(d)}${how}; pick a subfolder`, { deal_id: d.id });
    try {
      const { item, existing } = await saveToDeal(d, cat, base, c.docs);
      return filedNow(item, existing, `Matched ${label(d)}${how}`, { deal_id: d.id, folder: cat });
    } catch (e) {
      return record('review', `Matched ${label(d)} but saving failed: ${e instanceof Error ? e.message : String(e)}`, { deal_id: d.id, folder: cat });
    }
  }

  if (m.how === 'city' && m.deal) return record('review', `Mentions ${m.deal.city}; is this ${label(m.deal)}?`, { deal_id: m.deal.id, folder: cat });
  if (m.how === 'several') {
    const withFolder = (m.others || []).filter(fileable);
    if (withFolder.length) return record('review', `Mentions several deals: ${(m.others || []).map(label).join(', ')}`, { deal_id: withFolder[0].id, folder: cat });
  }

  const weak = weakCompanyFolder(att.name, msg.subject);
  if (weak) return toCompany(weak, 'Company document');
  if (m.how === 'several') return record('skipped', `Mentions ${(m.others || []).map(label).join(', ')} (no folders yet)`, { folder: cat });
  // Looks like a deal document but no deal is named: worth a look.
  if (cat) return record('review', 'No deal named in the email', { folder: cat });
  const offering = offeringByAddress(att.name, msg.subject);
  if (offering) return toCompany(offering, 'Property that is not a CRM deal');
  return record('skipped', 'Nothing to say where it goes');
}

export interface ScanResult { messages: number; filed: number; review: number; skipped: number; errors: string[]; more: boolean; since: string }

// Scan from the watermark forward until done or out of time. Safe to re-run: each
// attachment is recorded once (message id + attachment id).
export async function scanMail(budgetMs = 45_000): Promise<ScanResult> {
  const started = Date.now();
  const c = await loadCtx();
  const mark = await get<{ value: string }>('SELECT value FROM app_state WHERE key = ?', [WATERMARK_KEY]);
  const since = mark?.value ?? new Date(Date.now() - FIRST_SCAN_DAYS * 86400_000).toISOString();
  const result: ScanResult = { messages: 0, filed: 0, review: 0, skipped: 0, errors: [], more: false, since };
  let watermark = since;
  let next: string | undefined;

  outer: do {
    const page = await messagesWithAttachments(since, next);
    next = page.nextLink;
    for (const msg of page.messages) {
      if (Date.now() - started > budgetMs) { result.more = true; break outer; }
      result.messages++;
      if (!msg.isDraft) {
        try {
          for (const att of await messageAttachments(msg.id)) {
            if (await get('SELECT id FROM email_files WHERE message_id = ? AND attachment_id = ?', [msg.id, att.id])) continue;
            await processAttachment(msg, att, c);
          }
        } catch (e) {
          result.errors.push(`${msg.subject || '(no subject)'}: ${e instanceof Error ? e.message : String(e)}`);
          result.more = true;
          break outer; // leave the watermark before this message so it is retried
        }
      }
      watermark = msg.receivedDateTime;
    }
  } while (next);

  Object.assign(result, c.counts);
  await run(
    "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [WATERMARK_KEY, watermark],
  );
  await run(
    "INSERT INTO app_state (key, value, updated_at) VALUES ('mail_filing_last_run', ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    [JSON.stringify({ at: new Date().toISOString(), ...result })],
  );
  return result;
}

export interface RecheckResult { checked: number; filed: number; review: number; skipped: number; more: boolean }

// Re-run the current rules over review and skipped items decided by older rules.
export async function recheckMail(budgetMs = 45_000): Promise<RecheckResult> {
  const started = Date.now();
  const rows = await all<EmailFile>(
    "SELECT * FROM email_files WHERE status IN ('review', 'skipped') AND COALESCE(rules_version, 0) < ? ORDER BY received_at LIMIT 500", [RULES_VERSION]);
  const out: RecheckResult = { checked: 0, filed: 0, review: 0, skipped: 0, more: false };
  if (!rows.length) return out;
  // Logos, invites and the like don't change with the rules.
  const trivial = rows.filter(r => r.reason && NOISE_REASONS.includes(r.reason));
  for (let i = 0; i < trivial.length; i += 100) {
    const ids = trivial.slice(i, i + 100).map(r => r.id);
    await run(`UPDATE email_files SET rules_version = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [RULES_VERSION, ...ids]);
  }
  out.checked += trivial.length;
  const c = await loadCtx();
  const byMessage = new Map<string, EmailFile[]>();
  for (const r of rows) if (!trivial.includes(r)) byMessage.set(r.message_id, [...(byMessage.get(r.message_id) || []), r]);
  for (const [messageId, recs] of Array.from(byMessage)) {
    if (Date.now() - started > budgetMs) { out.more = true; break; }
    const msg = await messageById(messageId);
    const atts = msg ? await messageAttachments(messageId) : [];
    for (const r of recs) {
      const att = atts.find(a => a.id === r.attachment_id);
      if (msg && att) await processAttachment(msg, att, c);
      else await run('UPDATE email_files SET rules_version = ? WHERE id = ?', [RULES_VERSION, r.id]); // email deleted
      out.checked++;
    }
  }
  out.filed = c.counts.filed; out.review = c.counts.review; out.skipped = c.counts.skipped;
  if (!out.more && rows.length === 500) out.more = true;
  return out;
}

// File one recorded attachment by hand (from the review list): to a deal subfolder
// (dealId + folder) or a company folder (dealId null, folder from COMPANY_FOLDERS).
export async function fileFromReview(id: number, dealId: number | null, folder: string): Promise<EmailFile> {
  const rec = await get<EmailFile>('SELECT * FROM email_files WHERE id = ?', [id]);
  if (!rec) throw new Error('Not found');
  // The message may have moved folders; its id stays valid unless deleted.
  if (!(await messageById(rec.message_id))) throw new Error('The email is no longer in the mailbox');
  folderCache.clear();
  companyFolderIds.clear();
  let item: DriveItem;
  if (!dealId) {
    if (!COMPANY_FOLDERS.includes(folder)) throw new Error('Unknown company folder');
    item = (await saveToCompany(folder, rec)).item;
  } else {
    const deal = await get<Deal>('SELECT * FROM deals WHERE id = ?', [dealId]);
    if (!deal) throw new Error('Deal not found');
    const docs = new DocsContext();
    if (!FOLDER_STAGES.includes(deal.stage) && !(deal.stage === 'Dead' && (await findDealFolder(deal, docs)))) {
      throw new Error(`${label(deal)} is ${deal.stage}; deal folders start at Negotiating PSA`);
    }
    if (folder !== '' && !STANDARD_SUBFOLDERS.includes(folder)) throw new Error('Unknown subfolder');
    item = (await saveToDeal(deal, folder, rec, docs)).item;
  }
  await run(
    "UPDATE email_files SET status = 'filed', deal_id = ?, folder = ?, drive_item_id = ?, drive_web_url = ?, filed_at = ?, reason = 'Filed from review' WHERE id = ?",
    [dealId || null, folder, item.id, item.webUrl, new Date().toISOString(), id],
  );
  return (await get<EmailFile>('SELECT * FROM email_files WHERE id = ?', [id]))!;
}
