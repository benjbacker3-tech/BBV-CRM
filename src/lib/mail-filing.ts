// Email attachment filing. Scans Ben's mailbox (received and sent) for messages with
// attachments and saves deal documents into the deal's OneDrive folder, using the same
// subfolder rules as the folder cleanup (categoryOf).
//
//   Auto-filed: the email names exactly one deal that has a folder (street number +
//   street, in the subject, body preview or file name), or continues a thread whose
//   attachments were already filed to that deal; and the file name says which
//   subfolder it belongs in.
//   Review: everything else that looks like a deal document — no deal, several deals,
//   a street-name-only match, or an unknown subfolder.
//   Skipped (recorded, not shown by default): signatures, invites, contact cards, and
//   attachments for deals that don't have a folder yet (LOI not accepted).

import { all, get, run } from './db';
import { Deal } from './utils';
import { STANDARD_SUBFOLDERS, findDealFolder, DocsContext } from './deal-docs';
import { categoryOf, organizeDeal } from './cleanup';
import { sameAddress } from './model-parse';
import {
  DriveItem, MailAttachment, MailMessage, attachmentBytes, children, createFolder, messageAttachments,
  messageById, messagesWithAttachments, uploadBytes,
} from './graph';

export const FOLDER_STAGES = ['Negotiating PSA', 'Under Contract', 'Closed'];
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
}

// Attachments that are never deal documents.
function noise(a: MailAttachment): string | null {
  const n = a.name.toLowerCase();
  if (a['@odata.type'] !== '#microsoft.graph.fileAttachment') return 'Not a file (forwarded email or cloud link)';
  if (a.isInline) return 'Inline image';
  if (/\.(ics|vcf|p7s|p7m)$/.test(n) || n === 'winmail.dat') return 'Invite, contact card or signature';
  if (/\.(png|jpe?g|gif|bmp|emz|wmz)$/.test(n) && (a.size < 100 * 1024 || /^(image|outlook-|att)\d*/.test(n))) return 'Small image (likely a logo or signature)';
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

interface Match { deal: Deal | null; how: 'address' | 'thread' | 'street' | 'several' | 'none'; others?: Deal[] }

async function matchDeal(msg: MailMessage, att: MailAttachment, deals: Deal[]): Promise<Match> {
  const text = `${msg.subject || ''}\n${att.name}\n${msg.bodyPreview || ''}`;
  const cands = addressCandidates(text);
  const hits = deals.filter(d => cands.some(c => sameAddress(c, label(d))));
  if (hits.length === 1) return { deal: hits[0], how: 'address' };
  if (hits.length > 1) {
    // Prefer the deal named in the file name itself.
    const inName = hits.filter(d => addressCandidates(att.name).some(c => sameAddress(c, label(d))));
    if (inName.length === 1) return { deal: inName[0], how: 'address' };
    return { deal: null, how: 'several', others: hits };
  }
  if (msg.conversationId) {
    const prior = await get<{ deal_id: number }>(
      "SELECT deal_id FROM email_files WHERE conversation_id = ? AND status = 'filed' AND deal_id IS NOT NULL GROUP BY deal_id ORDER BY COUNT(*) DESC LIMIT 1",
      [msg.conversationId],
    );
    const d = prior && deals.find(x => x.id === prior.deal_id);
    if (d) return { deal: d, how: 'thread' };
  }
  // Street name alone ("Ives - title objections"): only a suggestion, and only when
  // no other deal shares the street name.
  const head = `${msg.subject || ''} ${att.name}`.toLowerCase();
  const byStreet = deals.filter(d => { const s = streetOf(d); return s && new RegExp(`\\b${s}\\b`).test(head); });
  if (byStreet.length === 1 && deals.filter(d => streetOf(d) === streetOf(byStreet[0])).length === 1) return { deal: byStreet[0], how: 'street' };
  return { deal: null, how: 'none' };
}

// Deal folder, created (with its standard subfolders) when the deal is at a folder stage.
async function dealFolder(deal: Deal, ctx: DocsContext): Promise<DriveItem | null> {
  const found = await findDealFolder(deal, ctx);
  if (found || !FOLDER_STAGES.includes(deal.stage)) return found;
  await organizeDeal(deal.id);
  return findDealFolder(deal, new DocsContext());
}

const subfolderCache = new Map<string, DriveItem[]>();
async function saveToDeal(deal: Deal, folder: string, rec: { message_id: string; attachment_id: string; file_name: string; size: number | null }, ctx: DocsContext): Promise<{ item: DriveItem; existing: boolean }> {
  const root = await dealFolder(deal, ctx);
  if (!root) throw new Error(`${label(deal)} has no OneDrive folder`);
  const sub = folder === '' ? root : await createFolder(root.id, folder);
  if (!subfolderCache.has(sub.id)) subfolderCache.set(sub.id, await children(sub.id));
  const there = subfolderCache.get(sub.id)!;
  const same = there.find(i => i.file && i.name.toLowerCase() === rec.file_name.toLowerCase() && (rec.size == null || Math.abs((i.size ?? 0) - rec.size) < 64));
  if (same) return { item: same, existing: true };
  const item = await uploadBytes(sub.id, rec.file_name, await attachmentBytes(rec.message_id, rec.attachment_id));
  there.push(item);
  if (deal.drive_folder_id !== root.id) {
    const parentPath = root.parentReference?.path?.split('root:')[1] ?? '';
    await run('UPDATE deals SET drive_folder_id = ?, drive_folder_path = ? WHERE id = ?', [root.id, `${parentPath}/${root.name}`, deal.id]);
  }
  return { item, existing: false };
}

export interface ScanResult { messages: number; filed: number; review: number; skipped: number; errors: string[]; more: boolean; since: string }

// Scan from the watermark forward until done or out of time. Safe to re-run: each
// attachment is recorded once (message id + attachment id).
export async function scanMail(budgetMs = 45_000): Promise<ScanResult> {
  const started = Date.now();
  const deals = await all<Deal>("SELECT * FROM deals WHERE stage != 'Dead'");
  const ctx = new DocsContext();
  const mark = await get<{ value: string }>('SELECT value FROM app_state WHERE key = ?', [WATERMARK_KEY]);
  const since = mark?.value ?? new Date(Date.now() - FIRST_SCAN_DAYS * 86400_000).toISOString();
  const result: ScanResult = { messages: 0, filed: 0, review: 0, skipped: 0, errors: [], more: false, since };
  let watermark = since;
  let next: string | undefined;
  subfolderCache.clear();

  outer: do {
    const page = await messagesWithAttachments(since, next);
    next = page.nextLink;
    for (const msg of page.messages) {
      if (Date.now() - started > budgetMs) { result.more = true; break outer; }
      result.messages++;
      if (!msg.isDraft) {
        try {
          await scanMessage(msg, deals, ctx, result);
        } catch (e) {
          result.errors.push(`${msg.subject || '(no subject)'}: ${e instanceof Error ? e.message : String(e)}`);
          result.more = true;
          break outer; // leave the watermark before this message so it is retried
        }
      }
      watermark = msg.receivedDateTime;
    }
  } while (next);

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

async function scanMessage(msg: MailMessage, deals: Deal[], ctx: DocsContext, result: ScanResult) {
  const atts = await messageAttachments(msg.id);
  const sender = msg.from?.emailAddress ? `${msg.from.emailAddress.name || ''} <${msg.from.emailAddress.address || ''}>`.trim() : null;
  for (const att of atts) {
    const seen = await get<{ id: number }>('SELECT id FROM email_files WHERE message_id = ? AND attachment_id = ?', [msg.id, att.id]);
    if (seen) continue;
    const base = {
      message_id: msg.id, attachment_id: att.id, conversation_id: msg.conversationId, received_at: msg.receivedDateTime,
      sender, subject: msg.subject, web_link: msg.webLink, file_name: att.name, size: att.size,
    };
    const record = (status: EmailFile['status'], reason: string, extra: Partial<EmailFile> = {}) => {
      if (status === 'filed') result.filed++; else if (status === 'review') result.review++; else result.skipped++;
      const row = { ...base, status, reason, deal_id: null, folder: null, drive_item_id: null, drive_web_url: null, filed_at: null, ...extra };
      const keys = Object.keys(row);
      return run(`INSERT OR IGNORE INTO email_files (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, keys.map(k => row[k as keyof typeof row] as string | number | null));
    };

    const junk = noise(att);
    if (junk) { await record('skipped', junk); continue; }

    const cat = categoryOf(att.name, false);
    const m = await matchDeal(msg, att, deals);

    if (m.deal && (m.how === 'address' || m.how === 'thread')) {
      if (!FOLDER_STAGES.includes(m.deal.stage)) {
        await record('skipped', `${label(m.deal)} is ${m.deal.stage}; no folder until the LOI is accepted`, { deal_id: m.deal.id, folder: cat });
        continue;
      }
      if (!cat) {
        await record('review', `Matched ${label(m.deal)}${m.how === 'thread' ? ' (same email thread)' : ''}; pick a subfolder`, { deal_id: m.deal.id });
        continue;
      }
      const dupe = await get<{ id: number }>("SELECT id FROM email_files WHERE status = 'filed' AND deal_id = ? AND lower(file_name) = lower(?) AND size = ?", [m.deal.id, att.name, att.size]);
      if (dupe) { await record('skipped', 'Same file already filed from another email', { deal_id: m.deal.id, folder: cat }); continue; }
      let saved: Awaited<ReturnType<typeof saveToDeal>>;
      try {
        saved = await saveToDeal(m.deal, cat, base, ctx);
      } catch (e) {
        await record('review', `Matched ${label(m.deal)} but saving failed: ${e instanceof Error ? e.message : String(e)}`, { deal_id: m.deal.id, folder: cat });
        continue;
      }
      const { item, existing } = saved;
      await record('filed', existing ? 'Already in the folder' : `Matched ${label(m.deal)}${m.how === 'thread' ? ' (same email thread)' : ''}`, {
        deal_id: m.deal.id, folder: cat, drive_item_id: item.id, drive_web_url: item.webUrl, filed_at: new Date().toISOString(),
      });
      continue;
    }

    if (m.how === 'street' && m.deal) {
      if (FOLDER_STAGES.includes(m.deal.stage)) await record('review', `Mentions ${streetOf(m.deal)}; is this ${label(m.deal)}?`, { deal_id: m.deal.id, folder: cat });
      else await record('skipped', `Mentions ${label(m.deal)} (${m.deal.stage}, no folder yet)`, { deal_id: m.deal.id, folder: cat });
      continue;
    }
    if (m.how === 'several') {
      const withFolder = (m.others || []).filter(d => FOLDER_STAGES.includes(d.stage));
      if (withFolder.length) await record('review', `Mentions several deals: ${(m.others || []).map(label).join(', ')}`, { deal_id: withFolder[0].id, folder: cat });
      else await record('skipped', `Mentions ${(m.others || []).map(label).join(', ')} (no folders yet)`, { folder: cat });
      continue;
    }
    // No deal. Worth a look only if the name says it's a deal document.
    if (cat) await record('review', 'No deal named in the email', { folder: cat });
    else await record('skipped', 'No deal named and not a recognised deal document');
  }
}

// File one recorded attachment by hand (from the review list).
export async function fileFromReview(id: number, dealId: number, folder: string): Promise<EmailFile> {
  const rec = await get<EmailFile>('SELECT * FROM email_files WHERE id = ?', [id]);
  if (!rec) throw new Error('Not found');
  const deal = await get<Deal>('SELECT * FROM deals WHERE id = ?', [dealId]);
  if (!deal) throw new Error('Deal not found');
  if (!FOLDER_STAGES.includes(deal.stage)) throw new Error(`${label(deal)} is ${deal.stage}; deal folders start at Negotiating PSA`);
  if (folder !== '' && !STANDARD_SUBFOLDERS.includes(folder)) throw new Error('Unknown subfolder');
  // The message may have moved folders; its id stays valid unless deleted.
  if (!(await messageById(rec.message_id))) throw new Error('The email is no longer in the mailbox');
  subfolderCache.clear();
  const { item } = await saveToDeal(deal, folder, rec, new DocsContext());
  await run(
    "UPDATE email_files SET status = 'filed', deal_id = ?, folder = ?, drive_item_id = ?, drive_web_url = ?, filed_at = ?, reason = 'Filed from review' WHERE id = ?",
    [deal.id, folder, item.id, item.webUrl, new Date().toISOString(), id],
  );
  return (await get<EmailFile>('SELECT * FROM email_files WHERE id = ?', [id]))!;
}
