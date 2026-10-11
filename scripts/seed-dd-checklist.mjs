// One-time load of Templates/SPC Dilligence Checklist.xlsx ("Diligence Checklist" sheet,
// 10/2026 version) into the CRM's diligence checklist and spend tracker.
//
//   node --env-file=.env.local scripts/seed-dd-checklist.mjs --dry-run   # preview
//   node --env-file=.env.local scripts/seed-dd-checklist.mjs             # apply
//
// Non-destructive: checklist lines are only filled while still blank (status open, no
// vendor, no note), and costs are only added for a deal that has none yet.
import { createClient } from '@libsql/client';
import { DD_TEMPLATE } from '../src/lib/dd-template.ts';

const dry = process.argv.includes('--dry-run');
const db = createClient({ url: process.env.TURSO_DATABASE_URL || 'file:sandpiper.db', authToken: process.env.TURSO_AUTH_TOKEN });

// [item_key, status, vendor, note], straight from the workbook. "X" / "SAVED" → done;
// "Clean" reports → done; TBD / waiting → open; anything else in motion → in_progress.
const SHEET = {
  '10275 E 106th': {
    items: [
      ['signed_loi', 'done'],
      ['debt_kickoff', 'done'],
      ['legal_kickoff', 'in_progress', 'Wormser Casey', 'Wormser Casey deal / Burke debt and equity'],
      ['dd_kickoff', 'in_progress', 'True North, AEI, Empire'],
      ['em_deposit', 'in_progress', null, '$20K / split with AD EJ'],
      ['critical_dates', 'done', null, 'DD: 10/31 · Close: 11/9'],
      ['ownership_materials', 'done', null, 'Saved'],
      ['schedule_reports', 'done'],
      ['esa', 'done', 'True North', 'Phase I — clean'],
      ['pca', 'done', 'AEI', 'Clean'],
      ['survey', 'in_progress', 'AEI'],
      ['title', 'in_progress', 'Andy'],
      ['roof', 'in_progress', 'Empire'],
      ['contractor', 'open', null, 'TBD'],
      ['zoning', 'in_progress', null, 'PZR ordered'],
      ['tax', 'in_progress', 'Ryan', 'Ryan engaged'],
      ['insurance', 'in_progress', 'CCIG', 'In progress'],
      ['lease_abstracts', 'in_progress', 'Burke'],
      ['estoppels', 'in_progress', null, 'Sent to seller / tenant'],
      ['tenant_financials', 'open', null, 'Post DD'],
      ['tenant_interview', 'done'],
      ['construction_budget', 'in_progress', null, 'Standard maint. + roof'],
      ['equity_approval', 'in_progress', 'CentrePoint Properties', 'Early Oct'],
      ['lender', 'in_progress', null, 'South State or First Interstate'],
      ['property_mgmt', 'in_progress', 'RIO / Chad'],
    ],
    // Diligence Spend Tracker. Reports already ordered count as signed; legal is an estimate.
    costs: [
      ['Legal', null, 15000, 'proposal', 'Transactional (estimate)'],
      ['PCA', 'AEI', 2850, 'signed'],
      ['Phase I', 'True North', 3600, 'signed'],
      ['Survey', 'AEI', 4000, 'signed'],
      ['Zoning', null, 950, 'signed', 'PZR'],
      ['Tax', 'Ryan', 850, 'signed'],
    ],
  },
  '1862 Ives': {
    items: [
      ['signed_loi', 'done'],
      ['debt_kickoff', 'open', null, 'Waiting for PSA'],
      ['legal_kickoff', 'in_progress', 'Burke', 'Burke PSA'],
      ['esa', 'open', 'True North', 'No proposal yet'],
      ['title', 'in_progress', 'Andy'],
      ['zoning', 'in_progress', null, 'PZR'],
      ['tax', 'open', null, 'TBD'],
      ['insurance', 'open', 'CCIG', 'Send CCIG info'],
      ['property_mgmt', 'open', null, 'TBD'],
    ],
    costs: [],
  },
};

// Same tables as lib/db.ts, in case the app hasn't started against this database yet.
if (!dry) await db.executeMultiple(`
  CREATE TABLE IF NOT EXISTS dd_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT, deal_id INTEGER NOT NULL, item_key TEXT NOT NULL,
    section TEXT NOT NULL, grp TEXT, label TEXT NOT NULL, sort INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done','na')),
    vendor TEXT, note TEXT, due_date TEXT, updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(deal_id, item_key), FOREIGN KEY (deal_id) REFERENCES deals(id));
  CREATE TABLE IF NOT EXISTS dd_costs (
    id INTEGER PRIMARY KEY AUTOINCREMENT, deal_id INTEGER NOT NULL, category TEXT NOT NULL, vendor TEXT,
    proposal_amount REAL, invoice_amount REAL,
    status TEXT NOT NULL DEFAULT 'proposal' CHECK(status IN ('proposal','signed','invoiced','paid','declined')),
    paid_date TEXT, notes TEXT, created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (deal_id) REFERENCES deals(id));
  CREATE INDEX IF NOT EXISTS ix_dd_costs_deal ON dd_costs(deal_id);
`);
const tableExists = async t => (await db.execute({ sql: "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", args: [t] })).rows.length > 0;
const q = async (sql, args) => ((await tableExists('dd_items')) ? (await db.execute({ sql, args })).rows : []);

let ops = 0;
const exec = async (sql, args, desc) => {
  ops++;
  console.log(`${dry ? '[dry] ' : ''}${desc}`);
  if (!dry) await db.execute({ sql, args });
};

for (const [name, data] of Object.entries(SHEET)) {
  const deal = (await db.execute({ sql: 'SELECT id, stage FROM deals WHERE name = ?', args: [name] })).rows[0];
  if (!deal) { console.log(`skip ${name}: no such deal`); continue; }
  console.log(`\n== ${name} (#${deal.id}, ${deal.stage})`);

  const have = new Set((await q('SELECT item_key FROM dd_items WHERE deal_id = ?', [deal.id])).map(r => r.item_key));
  const missing = DD_TEMPLATE.map((t, i) => ({ ...t, sort: (i + 1) * 10 })).filter(t => !have.has(t.key));
  if (missing.length) {
    ops++;
    console.log(`${dry ? '[dry] ' : ''}create ${missing.length} checklist lines from template`);
    if (!dry) await db.batch(missing.map(t => ({
      sql: 'INSERT OR IGNORE INTO dd_items (deal_id, item_key, section, grp, label, sort) VALUES (?, ?, ?, ?, ?, ?)',
      args: [deal.id, t.key, t.section, t.grp ?? null, t.label, t.sort],
    })));
  }

  for (const [key, status, vendor = null, note = null] of data.items) {
    const row = (await q('SELECT status, vendor, note FROM dd_items WHERE deal_id = ? AND item_key = ?', [deal.id, key]))[0];
    if (row && (row.status !== 'open' || row.vendor || row.note)) { console.log(`keep ${key} (already edited)`); continue; }
    await exec(
      "UPDATE dd_items SET status = ?, vendor = ?, note = ?, updated_at = datetime('now') WHERE deal_id = ? AND item_key = ?",
      [status, vendor, note, deal.id, key],
      `${key}: ${status}${vendor ? ` · ${vendor}` : ''}${note ? ` · ${note}` : ''}`,
    );
  }

  const costCount = Number((await q('SELECT COUNT(*) n FROM dd_costs WHERE deal_id = ?', [deal.id]))[0]?.n ?? 0);
  if (costCount) { console.log(`keep costs (${costCount} lines already)`); continue; }
  for (const [category, vendor, amount, status, notes = null] of data.costs) {
    await exec(
      'INSERT INTO dd_costs (deal_id, category, vendor, proposal_amount, status, notes) VALUES (?, ?, ?, ?, ?, ?)',
      [deal.id, category, vendor, amount, status, notes],
      `cost ${category}${vendor ? ` (${vendor})` : ''} $${amount.toLocaleString()} ${status}`,
    );
  }
}
console.log(`\n${ops} operation(s)${dry ? ' previewed — run without --dry-run to apply' : ' applied'}`);
