// Broker leads: scan new mail for offering emails and keep them as leads for Ben to add to
// the Pipeline or dismiss (Leads tab). Runs with the daily email cron and on "Check email".
// Detection and parsing live in lib/lead-parse.ts; this file is the mailbox walk and storage.
import { all, get, run } from './db';
import { CITY_STATE } from './utils';
import { sameAddress } from './model-parse';
import { fromBen } from './mail-filing';
import { junkFolderId, messageAttachments, messageText, messagesSince } from './graph';
import { firmOf, isLead, parseLead } from './lead-parse';

const SINCE_KEY = 'leads_since';
const LOCK_KEY = 'leads_lock';
const FIRST_SCAN_DAYS = 30;

export interface Lead {
  id: number; message_id: string; conversation_id: string | null; received_at: string;
  sender_name: string | null; sender_email: string | null; firm: string | null;
  subject: string | null; preview: string | null; web_link: string | null; attachments: string | null; why: string | null;
  address: string | null; city: string | null; state: string | null;
  price: number | null; acres: number | null; sf: number | null; cap_rate: number | null;
  status: 'new' | 'kept' | 'dismissed'; deal_id: number | null; match_deal_id: number | null;
  times_seen: number; last_seen_at: string | null; created_at: string;
}

export interface LeadScan { checked: number; added: number; repeats: number; since: string; more: boolean; busy?: boolean; errors: string[] }

const setState = (key: string, value: string) => run(
  `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
   ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`, [key, value]);

async function takeLock(ms: number): Promise<boolean> {
  const r = await run(
    `INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE app_state.value < ?`,
    [LOCK_KEY, new Date(Date.now() + ms).toISOString(), new Date().toISOString()]);
  return r.rowsAffected > 0;
}

// "RE: FW: Off-Market IOS Opportunity in Brighton, CO" → "off-market ios opportunity in brighton, co"
const subjectKey = (s: string | null) => (s || '').replace(/^((re|fw|fwd):\s*)+/i, '').trim().toLowerCase();

export async function scanLeads(budgetMs = 30_000): Promise<LeadScan> {
  const started = Date.now();
  const mark = await get<{ value: string }>('SELECT value FROM app_state WHERE key = ?', [SINCE_KEY]);
  const since = mark?.value ?? new Date(Date.now() - FIRST_SCAN_DAYS * 86400_000).toISOString();
  const result: LeadScan = { checked: 0, added: 0, repeats: 0, since, more: false, errors: [] };
  if (!(await takeLock(budgetMs + 30_000))) return { ...result, more: true, busy: true };
  try {
    const junk = await junkFolderId().catch(() => null);
    const deals = await all<{ id: number; address: string | null; city: string | null }>('SELECT id, address, city FROM deals');
    const knownCities = Array.from(new Set([...Object.keys(CITY_STATE), ...deals.map(d => (d.city || '').toLowerCase()).filter(Boolean)]));
    let watermark = since;
    let next: string | undefined;

    outer: do {
      const page = await messagesSince(since, next);
      next = page.nextLink;
      for (const msg of page.messages) {
        if (Date.now() - started > budgetMs) { result.more = true; break outer; }
        watermark = msg.receivedDateTime;
        if (msg.isDraft || msg.parentFolderId === junk || fromBen(msg)) continue;
        result.checked++;
        if (await get('SELECT id FROM leads WHERE message_id = ?', [msg.id])) continue;
        try {
          // Attachment names: from the email filing's records when it already saw this
          // message, otherwise from the mailbox.
          let names: string[] = [];
          if (msg.hasAttachments) {
            names = (await all<{ file_name: string }>('SELECT DISTINCT file_name FROM email_files WHERE message_id = ?', [msg.id])).map(r => r.file_name);
            if (!names.length) names = (await messageAttachments(msg.id)).filter(a => !a.isInline).map(a => a.name);
          }
          const verdict = isLead(msg.subject || '', names);
          if (!verdict.lead) continue;

          const body = await messageText(msg.id).catch(() => msg.bodyPreview || '');
          const p = parseLead(msg.subject || '', body, names, knownCities);

          // The same listing again: count it, don't add it. Same thread or same address always
          // counts. A matching subject only counts from the same sender within 30 days when
          // neither names an address: brokers reuse "Off-Market IOS Opportunity in Brighton, CO"
          // for different sites.
          const key = subjectKey(msg.subject);
          const thread = await get<{ id: number }>('SELECT id FROM leads WHERE conversation_id = ? LIMIT 1', [msg.conversationId]);
          const sameAddr = p.address
            ? (await all<{ id: number; address: string | null }>('SELECT id, address FROM leads WHERE address IS NOT NULL')).find(l => sameAddress(l.address!, p.address!))
            : undefined;
          const sameBlast = !p.address && key.length >= 12
            ? await get<{ id: number }>(
              `SELECT id FROM leads WHERE address IS NULL AND sender_email = ? AND received_at >= ? AND
                 lower(replace(replace(replace(subject, 'RE: ', ''), 'FW: ', ''), 'Fw: ', '')) = ? LIMIT 1`,
              [msg.from?.emailAddress?.address ?? '', new Date(Date.parse(msg.receivedDateTime) - 30 * 86400_000).toISOString(), key])
            : undefined;
          const repeat = thread || sameAddr || sameBlast;
          if (repeat) {
            await run('UPDATE leads SET times_seen = times_seen + 1, last_seen_at = ? WHERE id = ?', [msg.receivedDateTime, repeat.id]);
            result.repeats++;
            continue;
          }

          const match = p.address ? deals.find(d => d.address && sameAddress(d.address, p.address!)) : undefined;
          await run(
            `INSERT INTO leads (message_id, conversation_id, received_at, sender_name, sender_email, firm, subject, preview, web_link, attachments, why,
               address, city, state, price, acres, sf, cap_rate, match_deal_id, last_seen_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [msg.id, msg.conversationId, msg.receivedDateTime, msg.from?.emailAddress?.name ?? null, msg.from?.emailAddress?.address ?? null,
              firmOf(msg.from?.emailAddress?.address), msg.subject, (body || msg.bodyPreview || '').replace(/\s+/g, ' ').trim().slice(0, 600), msg.webLink,
              JSON.stringify(names), verdict.why, p.address, p.city, p.state, p.price, p.acres, p.sf, p.cap_rate, match?.id ?? null, msg.receivedDateTime],
          );
          result.added++;
        } catch (e) {
          result.errors.push(`${msg.subject || '(no subject)'}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      await setState(SINCE_KEY, watermark);
    } while (next);

    await setState(SINCE_KEY, watermark);
    await setState('leads_last_run', JSON.stringify({ at: new Date().toISOString(), ...result }));
    return result;
  } finally {
    await run('DELETE FROM app_state WHERE key = ?', [LOCK_KEY]);
  }
}
