// Email attachment filing. Scans Ben's mailbox (received and sent) for messages with
// attachments and saves them into OneDrive:
//
//   Deal documents → the deal's folder, in the standard subfolder (categoryOf, or the
//   email subject when the file name doesn't say). A deal is recognised by street
//   number + street, or a street name or property LLC ("Verona IOS") unique to one
//   deal. Only active deals with a folder (Negotiating PSA, Under Contract, Closed) get
//   files: Tracking / LOI deals have no folder yet, and Dead deals are no longer filed.
//   Company documents → Formation, Investor Update, Accounting, Market Info, … (see
//   company-folders.ts).
//   Review: an active deal it isn't sure about (city only, same thread, several deals,
//   or no clear subfolder). Skipped: signatures, invites, mail reports, inactive deals,
//   and deal-type documents that don't name an active deal.
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
  DriveItem, MailAttachment, MailMessage, attachmentBytes, children, createFolder, download, ensureFolderPath,
  junkFolderId, messageAttachments, messageById, messagesWithAttachments, uploadBytes,
} from './graph';

export const FOLDER_STAGES = ['Negotiating PSA', 'Under Contract', 'Closed'];
export const RULES_VERSION = 7;

// Broker marketing emails ("Off-Market IOS Opportunity in Brighton, CO", "Kent IOS yard
// available for lease"). BROKER_BLAST applies to any match short of a street address;
// the looser words ("opportunity", "offering") only to city matches, since Ben's own
// investor emails use them.
const BROKER_BLAST = /off[- ]market|pre[- ]market|for sale|for (sub)?lease|available for|now available|just listed|new listing|hit the market|cap rate|\bom\b/;
const OFFERING_SUBJECT = new RegExp(`${BROKER_BLAST.source}|opportunity|offering`);

// Sent by Ben, from any of his addresses (Outlook shows his own mailbox as an
// Exchange address, so match the name too).
export const fromBen = (msg: MailMessage) => {
  const a = (msg.from?.emailAddress?.address || '').toLowerCase();
  const n = (msg.from?.emailAddress?.name || '').toLowerCase();
  return a === (process.env.MS_DRIVE_USER || '').toLowerCase() || /\bben(jamin)? backer\b/.test(n) || /benj\.backer3@|^ben@iovre\.com$/.test(a);
};
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
export function noise(a: MailAttachment): string | null {
  const n = a.name.toLowerCase();
  if (a['@odata.type'] !== '#microsoft.graph.fileAttachment') return NOISE_REASONS[0];
  if (a.isInline) return NOISE_REASONS[1];
  if (/\.(ics|vcf|p7s|p7m)$/.test(n) || n === 'winmail.dat') return NOISE_REASONS[2];
  if (/\.(png|jpe?g|gif|bmp|emz|wmz)$/.test(n) && (a.size < 100 * 1024 || /^(image\d*\.|outlook-|att\d+\.)/.test(n))) return NOISE_REASONS[3];
  return null;
}

const shortDirections = (s: string) => s.replace(/\b(\d{2,6}(?:-\d{2,6})?[\s_]+)(north|south|east|west)\b/gi, (_m, num: string, w: string) => num + w[0]);

// "1862 Ives Ave", "10275 E 106th" … anywhere in free text.
const ADDRESS_RE = /\b(\d{2,6})(?:-\d{2,6})?\s+(?:[nsew]\.?\s+)?([a-z0-9][a-z0-9-]*)/gi;
function addressCandidates(text: string): string[] {
  const out: string[] = [];
  // "10275 East 106th Avenue" → "10275 E 106th Avenue" (only right after the number, so a
  // street named North, as in "1919 W North Ln", keeps its name).
  const t = shortDirections(text.replace(/_/g, ' '));
  for (const m of Array.from(t.matchAll(ADDRESS_RE))) out.push(`${m[1]} ${m[2]}`);
  return out;
}

const label = (d: Deal) => d.address || d.name;

// Does the file name point at a property other than `deal`? Another CRM deal's street,
// or a different street address ("1436 Thornton WA - model.xlsm" emailed on a 106th
// thread). Dates, suite numbers and ranges like "6371-6399 Nesbitt" don't count.
export function namesOtherProperty(fileName: string, deal: Deal, deals: Deal[]): string | null {
  const n = shortDirections(fileName.replace(/_/g, ' '));
  const own = streetOf(deal);
  const ownNum = label(deal).match(/^\s*(\d+)/)?.[1];
  // A street address: number + ordinal ("12705 E 106th") or number + name + suffix ("230 F St").
  // A year followed by an ordinal is a date ("2026 1st Amendment") unless a direction
  // shows it is an address ("2001 E 120th Ave").
  const ADDR = /(^|[^\d-])(\d{2,6})\s+(?:([nsew])\.?\s+)?(?:(\d+(?:st|nd|rd|th))\b|([a-z]+)\s+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|ln|lane|ct|court|pl|place|pkwy|parkway|hwy|highway)\b)/gi;
  for (const m of Array.from(n.matchAll(ADDR))) {
    if (m[2] === ownNum || (/^(19|20)\d\d$/.test(m[2]) && !m[3])) continue;
    const c = `${m[2]} ${m[4] || m[5]}`;
    if (!sameAddress(c, label(deal))) return c;
  }
  // Number + street followed by a city and state: "7131 Bryhawke (North Charleston, SC)".
  const withCity = n.match(/(?:^|[^\d-])(\d{2,6})\s+([a-z]{3,}(?:\s+[a-z]{3,})?)\s*[,(]\s*[a-z][a-z .]+,\s*[a-z]{2}\b/i);
  if (withCity && withCity[1] !== ownNum && !sameAddress(`${withCity[1]} ${withCity[2]}`, label(deal))) return `${withCity[1]} ${withCity[2]}`;
  // Another number on the deal's own street ("6420 Nesbitt - OM.pdf" on a Nesbitt thread).
  // One wrong digit still counts as the deal ("1962 Ives").
  if (own) {
    for (const c of addressCandidates(n)) {
      const [num, street] = c.toLowerCase().split(' ');
      if (num !== ownNum && street === own.split(' ')[0] && !sameAddress(c, label(deal))) return c;
    }
  }
  const other = deals.find(d => {
    const s = streetOf(d);
    return d.id !== deal.id && s && s !== own && !COMMON_STREET.has(s) && new RegExp(`\\b${s}\\b`, 'i').test(n);
  });
  return other ? label(other) : null;
}
// The street name of a deal, every word up to the suffix: "18050 Keith Harrow" →
// "keith harrow", "1334 Thornton Ave SW" → "thornton". Numbered streets ("106th") have none.
const STREET_END = /^(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|ln|lane|ct|court|pl|place|pkwy|parkway|hwy|highway|[nsew]|ne|nw|se|sw)\.?$/;
const streetOf = (d: Deal) => {
  const m = label(d).toLowerCase().split(',')[0].match(/^\s*\d+\s+(?:[nsew]\.?\s+)?([a-z][a-z-]{3,}(?:\s+[a-z][a-z-]*\.?)*)/);
  if (!m) return null;
  const words = m[1].split(/\s+/);
  const end = words.findIndex((w, i) => i > 0 && STREET_END.test(w));
  return (end > 0 ? words.slice(0, end) : words).join(' ');
};
// Street names that are everyday words: they only count with the street number.
const COMMON_STREET = new Set(['north', 'south', 'east', 'west', 'union', 'main', 'park', 'center', 'central', 'market', 'grand', 'lake', 'river', 'valley', 'industrial', 'commerce', 'state', 'broadway']);
// Property LLCs named in deal notes ("Owner: Verona IOS LLC", "form Brighton IOS LLC").
const entitiesOf = (d: Deal) => Array.from((d.notes || '').matchAll(/\b([A-Z][A-Za-z0-9]+) IOS LLC\b/g), m => `${m[1].toLowerCase()} ios`);

// Subfolder from the file name; when the name doesn't say, the email subject decides if
// it's clear (contractor COIs and W-9s on a GC thread, an exhibit on a PSA thread).
const SUBJECT_RULES: [RegExp, string][] = [
  [/construction|\bgc\b|general contractor|contractor|pay app|\bdraw\b|lien waiver|change order|\broof|permit|security|camera|fenc(e|ing)/, '09 Construction'],
  [/\bloan\b|lender|appraisal|term sheet|financing|\bdebt\b|\bbank\b/, '04 Debt'],
  [/\bpsa\b|purchase (and|&) sale|purchase agreement|\bloi\b|letter of intent|earnest money|amendment|commission agreement|listing agreement/, '02 LOI & PSA'],
  [/\btitle\b|survey|\balta\b|phase i|\besa\b|environmental|zoning|\bpzr\b|geotech|due diligence|\bdd\b|inspection|\baei\b|\bpca\b|property condition/, '03 Diligence'],
  [/closing|settlement statement|wire instructions|escrow|\bfbdo|\bgf ?#|buyer stmt|seller stmt|title order/, '06 Closing'],
  [/\blease\b|tenant|estoppel|\bsnda\b|insurance|property tax|\btaxes\b|tax estimate|property management|\bpma\b|rent roll/, '07 Leasing & Mgmt'],
  [/\bjv\b|joint venture|operating agreement|org chart|capital call|investor|equity/, '05 Equity'],
  [/\bom\b|offering memo|brochure|site plan|drone|photos/, '08 Property Info'],
];

export function mailCategory(name: string, subject: string | null): string | null {
  const cat = categoryOf(name, false);
  const s = (subject || '').toLowerCase();
  const fromSubject = SUBJECT_RULES.filter(([re]) => re.test(s)).map(([, f]) => f);
  if (fromSubject[0] === '09 Construction' && /\bcoi\b|certificate of insurance/i.test(name)) return '09 Construction';
  // Tenant onboarding (W-9 / ACH forms on a tenant or lease thread) goes with leasing.
  if (/\bw-?9\b|\bach\b/i.test(name) && /tenant|\blease|leasing|school bus/.test(s)) return '07 Leasing & Mgmt';
  if (cat) return cat;
  // Only when the subject points one way; "PSA + loan" threads go to review.
  const bySubject = new Set(fromSubject).size === 1 ? fromSubject[0] : null;
  // An exhibit goes with its thread (a PSA exhibit to 02); otherwise it's a diligence exhibit.
  return bySubject ?? (/\bexhibit/i.test(name) ? '03 Diligence' : null);
}

interface Match { deal: Deal | null; how: 'address' | 'entity' | 'thread' | 'street' | 'city' | 'several' | 'none'; inName?: boolean; others?: Deal[] }

export async function matchDeal(msg: MailMessage, att: MailAttachment, deals: Deal[], fileable: (d: Deal) => boolean): Promise<Match> {
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
  // Street name alone ("Nesbitt Rd - Roof Timing"): counts when no other deal shares it.
  const head = `${msg.subject || ''} ${att.name}`.toLowerCase();
  const byStreet = deals.filter(d => { const s = streetOf(d); return s && !COMMON_STREET.has(s) && new RegExp(`\\b${s}\\b`).test(head); });
  if (byStreet.length === 1 && deals.filter(d => streetOf(d) === streetOf(byStreet[0])).length === 1) {
    return { deal: byStreet[0], how: 'street', inName: new RegExp(`\\b${streetOf(byStreet[0])}\\b`).test(att.name.toLowerCase()) };
  }
  // City alone ("Sandpiper Brighton - term sheet"): the deal when exactly one active deal
  // is in that city; several → review.
  const subj = (msg.subject || '').toLowerCase();
  const byCity = deals.filter(d => fileable(d) && d.city && new RegExp(`\\b${d.city.toLowerCase().replace(/[^a-z ]/g, '')}\\b`).test(subj));
  if (byCity.length === 1) return { deal: byCity[0], how: 'city' };
  if (byCity.length > 1) return { deal: null, how: 'several', others: byCity };
  if (msg.conversationId) {
    const prior = await get<{ deal_id: number }>(
      "SELECT deal_id FROM email_files WHERE conversation_id = ? AND status = 'filed' AND deal_id IS NOT NULL GROUP BY deal_id ORDER BY COUNT(*) DESC LIMIT 1",
      [msg.conversationId],
    );
    const d = prior && deals.find(x => x.id === prior.deal_id);
    if (d && fileable(d)) return { deal: d, how: 'thread' };
  }
  return { deal: null, how: 'none' };
}

// Deal folder, created (with its standard subfolders) when the deal is at a folder stage.
// Looked up once per run.
const dealFolders = new Map<number, Promise<DriveItem | null>>();
function dealFolder(deal: Deal, ctx: DocsContext): Promise<DriveItem | null> {
  if (!dealFolders.has(deal.id)) dealFolders.set(deal.id, (async () => {
    const found = await findDealFolder(deal, ctx);
    if (found || !FOLDER_STAGES.includes(deal.stage)) return found;
    await organizeDeal(deal.id);
    return findDealFolder(deal, new DocsContext());
  })());
  return dealFolders.get(deal.id)!;
}

type Rec = { message_id: string; attachment_id: string; file_name: string };

// Everything already under a deal folder (or a top-level company folder), all
// subfolders included, listed once per run. `rel` is the folder path below the root.
interface Tree { files: { item: DriveItem; rel: string }[]; folders: Map<string, DriveItem> }
const trees = new Map<string, Promise<Tree>>();
function treeOf(root: DriveItem): Promise<Tree> {
  if (!trees.has(root.id)) trees.set(root.id, (async () => {
    const t: Tree = { files: [], folders: new Map([['', root]]) };
    const walk = async (folder: DriveItem, rel: string, depth: number): Promise<void> => {
      const kids = await children(folder.id);
      await Promise.all(kids.map(async k => {
        if (k.file) t.files.push({ item: k, rel });
        else if (k.folder) {
          const r = rel ? `${rel}/${k.name}` : k.name;
          t.folders.set(r.toLowerCase(), k);
          if (depth < 6 && k.folder.childCount !== 0) await walk(k, r, depth + 1);
        }
      }));
    };
    await walk(root, '', 0);
    return t;
  })());
  return trees.get(root.id)!;
}

async function subfolder(t: Tree, rel: string): Promise<DriveItem> {
  let parent = t.folders.get('')!;
  const segs = rel.split('/').filter(Boolean);
  for (let i = 0; i < segs.length; i++) {
    const key = segs.slice(0, i + 1).join('/').toLowerCase();
    if (!t.folders.has(key)) t.folders.set(key, await createFolder(parent.id, segs[i]));
    parent = t.folders.get(key)!;
  }
  return parent;
}

// Save into `rel` under the root, unless the same bytes are already anywhere under it
// (another subfolder, an Archive folder, a "name 1.pdf" copy or a different name).
// Outlook's attachment size includes metadata, so the downloaded bytes are compared:
// sizes first, then the content of any file of exactly that size.
async function saveInto(root: DriveItem, rel: string, rec: Rec): Promise<{ item: DriveItem; existing: boolean; where: string }> {
  const t = await treeOf(root);
  const raw = await attachmentBytes(rec.message_id, rec.attachment_id);
  const bytes = Buffer.from(raw);
  for (const f of t.files.filter(f => f.item.size === bytes.length)) {
    if (Buffer.from(await download(f.item.id)).equals(bytes)) return { item: f.item, existing: true, where: f.rel };
  }
  const item = await uploadBytes((await subfolder(t, rel)).id, rec.file_name, raw);
  t.files.push({ item, rel });
  return { item, existing: false, where: rel };
}

async function saveToDeal(deal: Deal, folder: string, rec: Rec, ctx: DocsContext) {
  const root = await dealFolder(deal, ctx);
  if (!root) throw new Error(`${label(deal)} has no OneDrive folder`);
  const saved = await saveInto(root, folder, rec);
  if (deal.drive_folder_id !== root.id) {
    const parentPath = root.parentReference?.path?.split('root:')[1] ?? '';
    await run('UPDATE deals SET drive_folder_id = ?, drive_folder_path = ? WHERE id = ?', [root.id, `${parentPath}/${root.name}`, deal.id]);
    deal.drive_folder_id = root.id;
  }
  return saved;
}

// "Investor Update/Tour Decks": duplicates are looked for across all of Investor Update.
const companyRoots = new Map<string, Promise<DriveItem>>();
async function saveToCompany(path: string, rec: Rec) {
  const [top, ...rest] = path.split('/');
  if (!companyRoots.has(top)) companyRoots.set(top, ensureFolderPath(top));
  const saved = await saveInto(await companyRoots.get(top)!, rest.join('/'), rec);
  return { ...saved, where: [top, saved.where].filter(Boolean).join('/') };
}

interface Ctx {
  deals: Deal[];
  docs: DocsContext;
  counts: { filed: number; review: number; skipped: number };
}

async function loadCtx(): Promise<Ctx> {
  const deals = await all<Deal>('SELECT * FROM deals');
  const docs = new DocsContext();
  dealFolders.clear();
  trees.clear();
  companyRoots.clear();
  return { deals, docs, counts: { filed: 0, review: 0, skipped: 0 } };
}

const fileable = (d: Deal) => FOLDER_STAGES.includes(d.stage);

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
  // `where` is the folder the file is in: the planned one, or wherever an identical copy
  // already was (recorded there, so the inbox shows the real place).
  const filedNow = (saved: { item: DriveItem; existing: boolean; where: string }, reason: string, extra: Partial<EmailFile>) =>
    record('filed', saved.existing ? `Already in ${saved.where || 'the deal folder'}` : reason,
      { ...extra, folder: saved.where, drive_item_id: saved.item.id, drive_web_url: saved.item.webUrl, filed_at: new Date().toISOString() });

  const junk = noise(att) ?? companyNoise(att.name, sender);
  if (junk) return record('skipped', junk);

  const cat = mailCategory(att.name, msg.subject);
  // Models: the OneDrive copy is the source of truth, and model sync reads the newest file
  // in 01 Models, so emailed copies are never added on their own. Ben's own are skipped;
  // models from others wait in review.
  const isModel = categoryOf(att.name, false) === '01 Models';
  if (isModel && fromBen(msg)) return record('skipped', 'Model you sent (OneDrive has the original)');
  const strong = strongCompanyFolder(att.name);
  const m = await matchDeal(msg, att, c.deals, fileable);
  if (isModel && !strong) {
    const d = m.deal && fileable(m.deal) ? m.deal : null;
    const elsewhere = d && namesOtherProperty(att.name, d, c.deals);
    if (elsewhere) return record('skipped', `Model for ${elsewhere}, not ${label(d!)}`, { deal_id: d!.id });
    return d ? record('review', `Model from ${msg.from?.emailAddress?.name || 'someone else'}; file it only if you want it in ${label(d)}`, { deal_id: d.id, folder: '01 Models' })
      : record('skipped', 'Model, and no active deal named');
  }

  const toCompany = async (path: string, why: string) => {
    try {
      return filedNow(await saveToCompany(path, base), why, {});
    } catch (e) {
      return record('review', `Saving to ${path} failed: ${e instanceof Error ? e.message : String(e)}`, { folder: path });
    }
  };

  // Company documents named as such (investor decks, banking forms, engagement letters…),
  // unless the file name itself names a deal.
  if (strong && !(m.deal && m.inName)) return toCompany(strong, 'Company document');

  if (m.deal && m.how !== 'city' && m.how !== 'thread') {
    const d = m.deal;
    const how = m.how === 'street' ? ` (mentions ${streetOf(d)})` : m.how === 'entity' ? ' (property LLC)' : '';
    if (!fileable(d)) {
      return record('skipped', d.stage === 'Dead' ? `${label(d)} is no longer active` : `${label(d)} is ${d.stage}; no folder until the LOI is accepted`, { deal_id: d.id, folder: cat });
    }
    const elsewhere = namesOtherProperty(att.name, d, c.deals);
    if (elsewhere) return record('skipped', `Email is about ${label(d)}, but the file is named for ${elsewhere}`, { deal_id: d.id, folder: cat });
    // "New Listing: Brighton IOS yard" names the LLC but is a broker's listing.
    if (m.how !== 'address' && !fromBen(msg) && BROKER_BLAST.test((msg.subject || '').toLowerCase())) {
      return record('skipped', `Mentions ${label(d)}${how}, but looks like a broker listing`, { deal_id: d.id, folder: cat });
    }
    if (!cat) return record('review', `Matched ${label(d)}${how}; pick a subfolder`, { deal_id: d.id });
    try {
      return filedNow(await saveToDeal(d, cat, base, c.docs), `Matched ${label(d)}${how}`, { deal_id: d.id });
    } catch (e) {
      return record('review', `Matched ${label(d)} but saving failed: ${e instanceof Error ? e.message : String(e)}`, { deal_id: d.id, folder: cat });
    }
  }

  const weak = weakCompanyFolder(att.name, msg.subject);
  if ((m.how === 'city' || m.how === 'thread') && m.deal) {
    const elsewhere = namesOtherProperty(att.name, m.deal, c.deals);
    if (elsewhere) return record('skipped', `File is named for ${elsewhere}`, { folder: cat });
    // Neither a thread nor a city names the property, so a company document there (a
    // financing submission for another property, Sandpiper's own insurance certificate on
    // a Brighton thread) goes to the company folder.
    if (weak) return toCompany(weak, 'Company document');
  }
  // City alone counts as the deal (Ben, 10/8) while only one active deal is in that city,
  // except broker offerings ("Off-Market IOS Opportunity in Brighton") and screenshots.
  if (m.how === 'city' && m.deal) {
    const d = m.deal;
    if (OFFERING_SUBJECT.test((msg.subject || '').toLowerCase()) || !/\.(pdf|docx?|xlsx?|xlsm|pptx?|csv|zip)$/i.test(att.name)) {
      return record('skipped', `Mentions ${d.city}, but looks like a broker offering or a screenshot`, { folder: cat });
    }
    if (!cat) return record('review', `Mentions ${d.city} (${label(d)}); pick a subfolder`, { deal_id: d.id });
    try {
      return filedNow(await saveToDeal(d, cat, base, c.docs), `Mentions ${d.city} (${label(d)})`, { deal_id: d.id });
    } catch (e) {
      return record('review', `Mentions ${d.city} but saving failed: ${e instanceof Error ? e.message : String(e)}`, { deal_id: d.id, folder: cat });
    }
  }
  if (m.how === 'thread' && m.deal) return record('review', `Same email thread as other ${label(m.deal)} files; is it?`, { deal_id: m.deal.id, folder: cat });
  if (m.how === 'several') {
    const withFolder = (m.others || []).filter(fileable);
    if (withFolder.length) return record('review', `Mentions several deals: ${(m.others || []).map(label).join(', ')}`, { deal_id: withFolder[0].id, folder: cat });
  }

  if (weak) return toCompany(weak, 'Company document');
  if (m.how === 'several') return record('skipped', `Mentions ${(m.others || []).map(label).join(', ')} (no folders yet)`, { folder: cat });
  const offering = offeringByAddress(att.name, msg.subject);
  if (offering) return toCompany(offering, 'Property that is not a CRM deal');
  // A deal-type document that doesn't name an active deal: an old or dropped property.
  if (cat) return record('skipped', 'Deal document, but no active deal named', { folder: cat });
  return record('skipped', 'Nothing to say where it goes');
}

export interface ScanResult { messages: number; filed: number; review: number; skipped: number; errors: string[]; more: boolean; since: string; busy?: boolean }

const setState = (key: string, value: string) => run(
  "INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
  [key, value]);

// One run at a time (the daily cron and "Check email now" would otherwise both upload the
// same attachment). The lock expires on its own if a run dies.
const LOCK_KEY = 'mail_filing_lock';
async function takeLock(ms: number): Promise<boolean> {
  const r = await run(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE app_state.value < ?`,
    [LOCK_KEY, new Date(Date.now() + ms).toISOString(), new Date().toISOString()]);
  return r.rowsAffected > 0;
}
const releaseLock = () => run('DELETE FROM app_state WHERE key = ?', [LOCK_KEY]);

// A message whose attachments can't be read is retried on the next runs, then skipped,
// so one bad email can't hold up everything after it.
const MAX_TRIES = 3;

// Scan from the watermark forward until done or out of time. Safe to re-run: each
// attachment is recorded once (message id + attachment id).
export async function scanMail(budgetMs = 45_000): Promise<ScanResult> {
  const started = Date.now();
  const mark = await get<{ value: string }>('SELECT value FROM app_state WHERE key = ?', [WATERMARK_KEY]);
  const since = mark?.value ?? new Date(Date.now() - FIRST_SCAN_DAYS * 86400_000).toISOString();
  const result: ScanResult = { messages: 0, filed: 0, review: 0, skipped: 0, errors: [], more: false, since };
  if (!(await takeLock(budgetMs + 30_000))) return { ...result, more: true, busy: true };
  try {
    const c = await loadCtx();
    const junk = await junkFolderId().catch(() => null);
    let watermark = since;
    let next: string | undefined;

    outer: do {
      const page = await messagesWithAttachments(since, next);
      next = page.nextLink;
      for (const msg of page.messages) {
        if (Date.now() - started > budgetMs) { result.more = true; break outer; }
        result.messages++;
        if (!msg.isDraft && msg.parentFolderId !== junk) {
          try {
            for (const att of await messageAttachments(msg.id)) {
              // Also matched on time + name: rows saved before message ids became immutable
              // carry the old id.
              const seen = await get(
                'SELECT id FROM email_files WHERE (message_id = ? AND attachment_id = ?) OR (received_at = ? AND conversation_id IS ? AND file_name = ?)',
                [msg.id, att.id, msg.receivedDateTime, msg.conversationId, att.name]);
              if (!seen) await processAttachment(msg, att, c);
            }
          } catch (e) {
            const key = `mail_filing_fail:${msg.id}`;
            const tries = Number((await get<{ value: string }>('SELECT value FROM app_state WHERE key = ?', [key]))?.value || 0) + 1;
            result.errors.push(`${msg.subject || '(no subject)'}: ${e instanceof Error ? e.message : String(e)}`);
            if (tries < MAX_TRIES) {
              await setState(key, String(tries));
              result.more = true;
              break outer; // leave the watermark before this message so it is retried
            }
            await run('DELETE FROM app_state WHERE key = ?', [key]);
            result.errors.push(`Gave up on "${msg.subject || '(no subject)'}" after ${MAX_TRIES} tries; its attachments were not filed.`);
          }
        }
        watermark = msg.receivedDateTime;
      }
      await setState(WATERMARK_KEY, watermark); // progress survives a timeout
    } while (next);

    Object.assign(result, c.counts);
    await setState(WATERMARK_KEY, watermark);
    await setState('mail_filing_last_run', JSON.stringify({ at: new Date().toISOString(), ...result }));
    return result;
  } finally {
    await releaseLock();
  }
}

export interface RecheckResult { checked: number; filed: number; review: number; skipped: number; more: boolean; busy?: boolean; errors?: string[] }

// Re-run the current rules over review and skipped items decided by older rules.
export async function recheckMail(budgetMs = 45_000): Promise<RecheckResult> {
  const started = Date.now();
  const out: RecheckResult = { checked: 0, filed: 0, review: 0, skipped: 0, more: false, errors: [] };
  const rows = await all<EmailFile>(
    "SELECT * FROM email_files WHERE status IN ('review', 'skipped') AND COALESCE(rules_version, 0) < ? ORDER BY received_at LIMIT 500", [RULES_VERSION]);
  if (!rows.length) return out;
  if (!(await takeLock(budgetMs + 30_000))) return { ...out, more: true, busy: true };
  try {
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
      try {
        const msg = await messageById(messageId);
        const atts = msg ? await messageAttachments(messageId) : [];
        for (const r of recs) {
          // Ids fetched now may be in the immutable format; fall back to name and size,
          // and keep the stored ids so the existing row is the one updated.
          const att = atts.find(a => a.id === r.attachment_id) ?? atts.find(a => a.name === r.file_name && a.size === r.size);
          if (msg && att) await processAttachment({ ...msg, id: messageId }, { ...att, id: r.attachment_id }, c);
          else await run('UPDATE email_files SET rules_version = ? WHERE id = ?', [RULES_VERSION, r.id]); // email deleted
          out.checked++;
        }
      } catch (e) {
        // Leave these rows for the next recheck; one bad email doesn't stop the rest.
        out.errors!.push(e instanceof Error ? e.message : String(e));
      }
    }
    out.filed = c.counts.filed; out.review = c.counts.review; out.skipped = c.counts.skipped;
    if (!out.more && rows.length === 500) out.more = true;
    return out;
  } finally {
    await releaseLock();
  }
}

// File one recorded attachment by hand (from the review list): to a deal subfolder
// (dealId + folder) or a company folder (dealId null, folder from COMPANY_FOLDERS).
export async function fileFromReview(id: number, dealId: number | null, folder: string): Promise<EmailFile> {
  const rec = await get<EmailFile>('SELECT * FROM email_files WHERE id = ?', [id]);
  if (!rec) throw new Error('Not found');
  // Ids saved since immutable ids were turned on survive the email being moved or archived.
  if (!(await messageById(rec.message_id))) throw new Error('The email is no longer in the mailbox (deleted, or moved before this was recorded)');
  dealFolders.clear();
  trees.clear();
  companyRoots.clear();
  let saved: { item: DriveItem; existing: boolean; where: string };
  if (!dealId) {
    if (!COMPANY_FOLDERS.includes(folder)) throw new Error('Unknown company folder');
    saved = await saveToCompany(folder, rec);
  } else {
    const deal = await get<Deal>('SELECT * FROM deals WHERE id = ?', [dealId]);
    if (!deal) throw new Error('Deal not found');
    if (!FOLDER_STAGES.includes(deal.stage)) throw new Error(`${label(deal)} is ${deal.stage}; only active deals with a folder get files`);
    if (folder !== '' && !STANDARD_SUBFOLDERS.includes(folder)) throw new Error('Unknown subfolder');
    saved = await saveToDeal(deal, folder, rec, new DocsContext());
  }
  const reason = saved.existing ? `Already in ${saved.where || 'the deal folder'}` : 'Filed from review';
  const now = new Date().toISOString();
  await run(
    "UPDATE email_files SET status = 'filed', deal_id = ?, folder = ?, drive_item_id = ?, drive_web_url = ?, filed_at = ?, reason = ? WHERE id = ?",
    [dealId || null, saved.where, saved.item.id, saved.item.webUrl, now, reason, id],
  );
  // The same attachment forwarded on other emails is settled by this decision too: same
  // name, same size or thread, and never a row suggested for a different deal.
  await run(
    `UPDATE email_files SET status = 'filed', deal_id = ?, folder = ?, drive_item_id = ?, drive_web_url = ?, filed_at = ?, reason = 'Same file as one filed from review'
     WHERE status = 'review' AND id != ? AND lower(file_name) = lower(?) AND (size = ? OR conversation_id = ?)
       AND (deal_id IS NULL OR deal_id = ?)`,
    [dealId || null, saved.where, saved.item.id, saved.item.webUrl, now, id, rec.file_name, rec.size, rec.conversation_id, dealId],
  );
  return (await get<EmailFile>('SELECT * FROM email_files WHERE id = ?', [id]))!;
}
