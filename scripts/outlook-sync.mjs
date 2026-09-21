#!/usr/bin/env node
// Apply an Outlook status snapshot (sync/outlook-YYYY-MM-DD.json) to the CRM database.
//
//   node scripts/outlook-sync.mjs sync/outlook-2026-09-21.json            # apply
//   node scripts/outlook-sync.mjs sync/outlook-2026-09-21.json --dry-run  # preview only
//
// Uses TURSO_DATABASE_URL / TURSO_AUTH_TOKEN from the environment or .env.local
// (same as the app); falls back to the local file:sandpiper.db.
//
// Non-destructive + idempotent:
//  - Deals matched by address/name (plus aliases). Existing deals get the listed fields
//    updated; `insert_only` deals are only created if missing. Your own notes are kept —
//    only the "── Email status" block at the end is replaced on each run.
//  - Contacts matched by email (else name). Blank fields are filled; nothing is overwritten.
//  - Tasks / contact-log entries / diligence items are de-duplicated, so re-running is safe.
//  - LOIs (snapshot `lois[]`, extracted from the LOI attachments Ben emailed) are stored in the
//    `lois` table, one row per sent email (deduped by Outlook message id). The newest LOI drives
//    the deal's price / SF / acres / deposit / DD / close for deals still at Tracking or LOI
//    Submitted; later-stage deals only get blanks filled. Low-confidence LOIs are skipped unless
//    you pass --include-low.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@libsql/client';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const DRY = args.includes('--dry-run');
const INCLUDE_LOW = args.includes('--include-low');
if (!file) {
  console.error('Usage: node scripts/outlook-sync.mjs <snapshot.json> [--dry-run]');
  process.exit(1);
}

// Minimal .env.local loader (no dependency on dotenv)
for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const url = process.env.TURSO_DATABASE_URL || 'file:sandpiper.db';
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
const snap = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
const asOf = snap.as_of;
const MARK = '── Email status';

const log = [];
const say = s => { log.push(s); console.log(s); };
const q = async (sql, a = []) => (await db.execute({ sql, args: a })).rows;
const exec = async (sql, a = []) => {
  if (DRY) return { lastInsertRowid: 0 };
  return db.execute({ sql, args: a });
};
const activity = (type, id, action, description) =>
  exec('INSERT INTO activity_log (entity_type, entity_id, action, description) VALUES (?, ?, ?, ?)', [type, id, action, description]);

const tables = (await q("SELECT name FROM sqlite_master WHERE type='table'")).map(r => r.name);
if (!tables.includes('deals')) {
  console.error(`No CRM tables in ${url}. Start the app once (npm run dev and open it) so the schema is created, then re-run.`);
  process.exit(1);
}

console.log(`${DRY ? '[DRY RUN] ' : ''}Applying ${file} → ${url.startsWith('file:') ? url : url.replace(/\/\/.*@/, '//')}\n`);

// ── Deals ────────────────────────────────────────────────────────────────
const dealIds = {};
async function findDeal(d) {
  for (const k of [d.key, ...(d.aliases || [])]) {
    const rows = await q('SELECT * FROM deals WHERE lower(address) LIKE ? OR lower(name) LIKE ? ORDER BY id LIMIT 1',
      [`%${k.toLowerCase()}%`, `%${k.toLowerCase()}%`]);
    if (rows.length) return rows[0];
  }
  return null;
}
function withStatus(existingNotes, status) {
  const base = (existingNotes || '').split(MARK)[0].trimEnd();
  const block = `${MARK} (as of ${asOf}) ──\n` + status.map(s => `• ${s}`).join('\n');
  return base ? `${base}\n\n${block}` : block;
}

for (const d of snap.deals) {
  const existing = await findDeal(d);
  if (existing) {
    dealIds[d.key] = Number(existing.id);
    if (d.insert_only) { say(`deal   = ${d.key} (exists, left as-is)`); continue; }
    const f = { ...d.fields };
    delete f.name; delete f.address; // keep the CRM's own naming
    f.notes = withStatus(existing.notes, d.status || []);
    const keys = Object.keys(f);
    const changed = keys.filter(k => k === 'notes' ? f.notes !== existing.notes : String(existing[k] ?? '') !== String(f[k]));
    if (changed.length) {
      await exec(`UPDATE deals SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => f[k]), existing.id]);
      if (f.stage && f.stage !== existing.stage) {
        await activity('deal', Number(existing.id), 'stage_changed', `Stage changed from ${existing.stage} to ${f.stage} (Outlook sync)`);
      }
      await activity('deal', Number(existing.id), 'outlook_sync', `Outlook sync ${asOf}: updated ${changed.join(', ')}`);
      say(`deal   ~ ${d.key}: ${changed.join(', ')}`);
    } else say(`deal   = ${d.key} (no change)`);
  } else {
    const f = { source: 'Outlook sync', ios_eligible: 1, ...d.fields, notes: withStatus('', d.status || []) };
    const keys = Object.keys(f);
    const r = await exec(`INSERT INTO deals (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, keys.map(k => f[k]));
    dealIds[d.key] = Number(r.lastInsertRowid);
    await activity('deal', dealIds[d.key], 'created', `Deal "${d.fields.name}" added from Outlook sync ${asOf}`);
    say(`deal   + ${d.key} (${f.stage})`);
  }
}

// ── Contacts ─────────────────────────────────────────────────────────────
const contactIds = {};
for (const c of snap.contacts) {
  const rows = c.email
    ? await q('SELECT * FROM contacts WHERE lower(email) = ? LIMIT 1', [c.email.toLowerCase()])
    : await q('SELECT * FROM contacts WHERE lower(name) = ? LIMIT 1', [c.name.toLowerCase()]);
  const dealId = c.deal ? dealIds[c.deal] ?? null : null;
  const key = (c.email || c.name).toLowerCase();
  if (rows.length) {
    const ex = rows[0];
    contactIds[key] = Number(ex.id);
    const fill = {};
    for (const k of ['firm', 'phone', 'email', 'markets', 'type']) if (c[k] && !ex[k]) fill[k] = c[k];
    if (dealId && !ex.deal_id) fill.deal_id = dealId;
    if (c.notes && !(ex.notes || '').includes(c.notes)) fill.notes = [ex.notes, c.notes].filter(Boolean).join('\n');
    const keys = Object.keys(fill);
    if (keys.length) {
      await exec(`UPDATE contacts SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => fill[k]), ex.id]);
      say(`contact~ ${c.name}: ${keys.join(', ')}`);
    } else say(`contact= ${c.name}`);
  } else {
    const r = await exec(
      'INSERT INTO contacts (deal_id, type, name, firm, phone, email, markets, warmth, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [dealId, c.type ?? null, c.name, c.firm ?? null, c.phone ?? null, c.email ?? null, c.markets ?? null, 'warm', c.notes ?? null]);
    contactIds[key] = Number(r.lastInsertRowid);
    await activity('contact', contactIds[key], 'created', `Contact "${c.name}" added from Outlook sync ${asOf}`);
    say(`contact+ ${c.name}${c.firm ? ` (${c.firm})` : ''}`);
  }
}
const cid = email => contactIds[(email || '').toLowerCase()];

// ── LOIs ─────────────────────────────────────────────────────────────────
await exec(`CREATE TABLE IF NOT EXISTS lois (
  id INTEGER PRIMARY KEY AUTOINCREMENT, deal_id INTEGER, sent_date TEXT, property TEXT,
  price REAL, sf INTEGER, acreage REAL, deposit REAL, dd_days INTEGER, close_days INTEGER,
  exclusivity_days INTEGER, leaseback TEXT, other_terms TEXT, version_note TEXT,
  to_name TEXT, to_email TEXT, to_firm TEXT, attachment_name TEXT, message_id TEXT UNIQUE,
  outlook_link TEXT, created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (deal_id) REFERENCES deals(id))`);
const hasLoiTable = DRY ? (await q("SELECT name FROM sqlite_master WHERE name='lois'")).length > 0 : true;
const loiDeals = new Set();
const EARLY = ['Tracking', 'LOI Submitted'];
const outlookLink = id => `https://outlook.office365.com/owa/?ItemID=${encodeURIComponent(id)}&exvsurl=1&viewmodel=ReadMessageItem`;

for (const l of snap.lois || []) {
  const label = `${l.deal} ${l.sent_date}`;
  if (l.confidence === 'low' && !INCLUDE_LOW) { say(`loi    ! skipped (low confidence — check it, then re-run with --include-low): ${label}. ${l.notes || ''}`); continue; }

  // Deal: reuse from this run, else match, else create at "LOI Submitted"
  let dealId = dealIds[l.deal];
  if (!dealId) {
    const ex = await findDeal({ key: l.deal, aliases: l.aliases });
    if (ex) dealId = dealIds[l.deal] = Number(ex.id);
  }
  if (!dealId) {
    const r = await exec(
      'INSERT INTO deals (name, address, city, market, stage, source, ios_eligible) VALUES (?, ?, ?, ?, ?, ?, 1)',
      [l.deal, l.property, l.city ?? null, l.market ?? l.city ?? null, 'LOI Submitted', 'Outlook LOI']);
    dealId = dealIds[l.deal] = Number(r.lastInsertRowid);
    await activity('deal', dealId, 'created', `Deal "${l.deal}" added from LOI sent ${l.sent_date}`);
    say(`deal   + ${l.deal} (LOI Submitted, from LOI)`);
  }

  // Broker the LOI went to
  if (l.to_email) {
    const key = l.to_email.toLowerCase();
    const rows = await q('SELECT * FROM contacts WHERE lower(email) = ? LIMIT 1', [key]);
    if (rows.length) {
      contactIds[key] = Number(rows[0].id);
      if (!rows[0].deal_id && dealId) await exec('UPDATE contacts SET deal_id = ? WHERE id = ?', [dealId, rows[0].id]);
    } else {
      const name = (l.to_name || l.to_email).split('/')[0].trim();
      const r = await exec('INSERT INTO contacts (deal_id, type, name, firm, email, markets, warmth) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [dealId ?? null, 'broker', name, l.to_firm ?? null, l.to_email, l.market ?? l.city ?? null, 'warm']);
      contactIds[key] = Number(r.lastInsertRowid);
      say(`contact+ ${name} (${l.to_firm || 'broker'})`);
    }
    await exec('UPDATE contacts SET last_contact = ? WHERE lower(email) = ? AND (last_contact IS NULL OR last_contact < ?)', [l.sent_date, key, l.sent_date]);
  }

  if (hasLoiTable && (await q('SELECT id FROM lois WHERE message_id = ?', [l.message_id])).length) { say(`loi    = ${label}`); loiDeals.add(dealId); continue; }
  const r = await exec(
    `INSERT INTO lois (deal_id, sent_date, property, price, sf, acreage, deposit, dd_days, close_days, exclusivity_days,
       leaseback, other_terms, version_note, to_name, to_email, to_firm, attachment_name, message_id, outlook_link)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [dealId, l.sent_date, l.property, l.price ?? null, l.sf ?? null, l.acreage ?? null, l.deposit ?? null, l.dd_days ?? null,
     l.close_days ?? null, l.exclusivity_days ?? null, l.leaseback ?? null, l.other_terms ?? null, l.version_note ?? null,
     l.to_name ?? null, l.to_email ?? null, l.to_firm ?? null, l.attachment_name ?? null, l.message_id, outlookLink(l.message_id)]);
  if (contactIds[(l.to_email || '').toLowerCase()]) {
    const ext = `outlook-loi:${l.message_id}`;
    if (!(await q('SELECT id FROM contact_log WHERE external_id = ?', [ext])).length) {
      await exec("INSERT INTO contact_log (contact_id, type, note, date, external_id, source) VALUES (?, 'email', ?, ?, ?, 'outlook')",
        [contactIds[l.to_email.toLowerCase()], `Sent LOI — ${l.property}${l.price ? ` at $${Number(l.price).toLocaleString('en-US')}` : ''}`, l.sent_date, ext]);
    }
  }
  await activity('deal', dealId, 'loi_sent', `LOI sent ${l.sent_date}${l.price ? ` — $${Number(l.price).toLocaleString('en-US')}` : ''}`);
  loiDeals.add(dealId);
  say(`loi    + ${label}: ${l.price ? '$' + Number(l.price).toLocaleString('en-US') : 'no price'} · ${l.sf ?? '—'} SF · ${l.acreage ?? '—'} ac`);
}

// Newest LOI → deal fields
for (const dealId of loiDeals) {
  if (!dealId || DRY) continue;
  const [latest] = await q('SELECT * FROM lois WHERE deal_id = ? ORDER BY sent_date DESC, id DESC LIMIT 1', [dealId]);
  const [deal] = await q('SELECT * FROM deals WHERE id = ?', [dealId]);
  if (!latest || !deal) continue;
  const map = { asking_price: 'price', sf: 'sf', acreage: 'acreage', deposit: 'deposit', dd_days: 'dd_days', close_days: 'close_days' };
  const early = EARLY.includes(String(deal.stage));
  const set = {};
  for (const [col, src] of Object.entries(map)) {
    const v = latest[src];
    if (v == null) continue;
    const blank = deal[col] == null || Number(deal[col]) === 0;
    if ((early || blank) && Number(deal[col]) !== Number(v)) set[col] = v;
  }
  if (deal.stage === 'Tracking') set.stage = 'LOI Submitted';
  const keys = Object.keys(set);
  if (keys.length) {
    await exec(`UPDATE deals SET ${keys.map(k => `${k} = ?`).join(', ')} WHERE id = ?`, [...keys.map(k => set[k]), dealId]);
    say(`deal   ~ ${deal.name}: ${keys.map(k => `${k}=${set[k]}`).join(', ')} (from LOI ${latest.sent_date})`);
  }
}

// ── Tasks ────────────────────────────────────────────────────────────────
for (const t of snap.tasks) {
  const contactId = cid(t.contact_email);
  if (!contactId && !DRY) { say(`task   ! skipped (unknown contact ${t.contact_email}): ${t.note}`); continue; }
  const dup = await q('SELECT id FROM tasks WHERE note = ? AND (contact_id = ? OR ? IS NULL) LIMIT 1', [t.note, contactId ?? null, contactId ?? null]);
  if (dup.length) { say(`task   = ${t.note}`); continue; }
  const r = await exec('INSERT INTO tasks (contact_id, type, note, due_date, done) VALUES (?, ?, ?, ?, 0)', [contactId, t.type, t.note, t.due_date]);
  await activity('task', Number(r.lastInsertRowid), 'created', `Task created: ${t.note}`);
  say(`task   + [${t.due_date}] ${t.note}`);
}

// ── Contact log ──────────────────────────────────────────────────────────
for (const l of snap.contact_log) {
  const contactId = cid(l.contact_email);
  const ext = `outlook:${l.date}:${(l.contact_email || '').toLowerCase()}:${l.note.slice(0, 40)}`;
  const dup = await q('SELECT id FROM contact_log WHERE external_id = ? LIMIT 1', [ext]);
  if (dup.length) { say(`log    = ${l.date} ${l.note}`); continue; }
  await exec("INSERT INTO contact_log (contact_id, type, note, date, external_id, source) VALUES (?, ?, ?, ?, ?, 'outlook')",
    [contactId ?? null, l.type, l.note, l.date, ext]);
  if (contactId) await exec('UPDATE contacts SET last_contact = ? WHERE id = ? AND (last_contact IS NULL OR last_contact < ?)', [l.date, contactId, l.date]);
  say(`log    + ${l.date} ${l.note}`);
}

// ── Diligence ────────────────────────────────────────────────────────────
for (const g of snap.diligence) {
  const dealId = dealIds[g.deal];
  if (!dealId && !DRY) { say(`dilig  ! skipped (unknown deal ${g.deal})`); continue; }
  let rows = await q('SELECT * FROM diligence WHERE deal_id = ? AND category = ? LIMIT 1', [dealId ?? -1, g.category]);
  let dilId;
  if (rows.length) {
    dilId = Number(rows[0].id);
    await exec('UPDATE diligence SET vendor = ?, due_date = COALESCE(?, due_date) WHERE id = ?', [g.vendor, g.due_date ?? null, dilId]);
  } else {
    const r = await exec('INSERT INTO diligence (deal_id, category, vendor, due_date) VALUES (?, ?, ?, ?)', [dealId, g.category, g.vendor, g.due_date ?? null]);
    dilId = Number(r.lastInsertRowid);
  }
  for (const [label, status] of g.items) {
    const it = await q('SELECT * FROM diligence_items WHERE diligence_id = ? AND label = ? LIMIT 1', [dilId, label]);
    if (it.length) {
      if (it[0].status !== status) {
        await exec('UPDATE diligence_items SET status = ? WHERE id = ?', [status, it[0].id]);
        say(`dilig  ~ ${g.deal} / ${g.category}: ${label} → ${status}`);
      }
    } else {
      await exec('INSERT INTO diligence_items (diligence_id, label, status) VALUES (?, ?, ?)', [dilId, label, status]);
      say(`dilig  + ${g.deal} / ${g.category}: ${label} (${status})`);
    }
  }
}

console.log(`\n${DRY ? '[DRY RUN] nothing written.' : 'Done.'} ${log.length} operations.`);
