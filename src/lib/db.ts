import { createClient, Client, InArgs, InStatement } from '@libsql/client';

let _client: Client | null = null;
let _initPromise: Promise<void> | null = null;

export async function getDb(): Promise<Client> {
  if (!_client) {
    // Vercel / other serverless: only /tmp is writable. Local dev: project root is fine.
    const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    const defaultUrl = isServerless ? 'file:/tmp/sandpiper.db' : 'file:sandpiper.db';
    const url = process.env.TURSO_DATABASE_URL || defaultUrl;
    const authToken = process.env.TURSO_AUTH_TOKEN;
    _client = createClient({ url, authToken });
  }
  if (!_initPromise) {
    _initPromise = initSchema(_client);
  }
  await _initPromise;
  return _client;
}

// Helper wrappers for the common patterns we use
export async function all<T = Record<string, unknown>>(sql: string, args?: InArgs): Promise<T[]> {
  const db = await getDb();
  const res = await db.execute(args ? { sql, args } : sql);
  return res.rows as unknown as T[];
}

export async function get<T = Record<string, unknown>>(sql: string, args?: InArgs): Promise<T | undefined> {
  const db = await getDb();
  const res = await db.execute(args ? { sql, args } : sql);
  return (res.rows[0] as unknown as T) || undefined;
}

export async function run(sql: string, args?: InArgs): Promise<{ lastInsertRowid: number; rowsAffected: number }> {
  const db = await getDb();
  const res = await db.execute(args ? { sql, args } : sql);
  return {
    lastInsertRowid: res.lastInsertRowid ? Number(res.lastInsertRowid) : 0,
    rowsAffected: res.rowsAffected,
  };
}

export async function batch(statements: InStatement[]): Promise<void> {
  const db = await getDb();
  await db.batch(statements);
}

async function initSchema(db: Client) {
  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      market TEXT,
      submarket TEXT,
      sf INTEGER DEFAULT 0,
      acreage REAL,
      occupancy REAL DEFAULT 0,
      asking_price REAL,
      yoc_initial REAL DEFAULT 0,
      yoc_target REAL,
      equity_required REAL DEFAULT 0,
      zoning TEXT,
      ios_eligible INTEGER DEFAULT 1,
      stage TEXT DEFAULT 'Tracking',
      source TEXT,
      dd_expiry TEXT,
      dd_days INTEGER DEFAULT 0,
      close_date TEXT,
      close_days INTEGER DEFAULT 0,
      deposit REAL DEFAULT 0,
      notes TEXT,
      pinned INTEGER DEFAULT 0,
      ownership_pct REAL DEFAULT 100,       -- SPC's ownership percentage of the asset (100 for wholly-owned; e.g. 18 for a co-invest)
      state TEXT,                           -- 2-letter US state code (CO, WA, NV, ...)
      irr REAL,                             -- underwritten IRR as decimal (0.225 = 22.5%)
      em REAL,                              -- underwritten equity multiple (2.1 = 2.1x)
      all_in_basis REAL,                    -- total capitalization (purchase price + capex + closing + lender fees)
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER,
      type TEXT CHECK(type IN ('broker','owner')),
      name TEXT NOT NULL,
      firm TEXT,
      phone TEXT,
      email TEXT,
      markets TEXT,
      warmth TEXT CHECK(warmth IN ('hot','warm','cool')) DEFAULT 'cool',
      last_contact TEXT,
      notes TEXT,
      FOREIGN KEY (deal_id) REFERENCES deals(id)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER,
      type TEXT CHECK(type IN ('call','email','coffee')),
      note TEXT,
      due_date TEXT,
      done INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    );

    CREATE TABLE IF NOT EXISTS contact_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id INTEGER,
      type TEXT CHECK(type IN ('call','email','coffee','sms')),
      note TEXT,
      date TEXT DEFAULT (date('now')),
      external_id TEXT,
      source TEXT DEFAULT 'manual',
      FOREIGN KEY (contact_id) REFERENCES contacts(id)
    );

    CREATE TABLE IF NOT EXISTS diligence (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER,
      category TEXT CHECK(category IN ('site','env','pca','survey','roof','contractor','zoning')),
      vendor TEXT,
      due_date TEXT,
      FOREIGN KEY (deal_id) REFERENCES deals(id)
    );

    CREATE TABLE IF NOT EXISTS diligence_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      diligence_id INTEGER,
      label TEXT,
      status TEXT CHECK(status IN ('pending','in-progress','complete')) DEFAULT 'pending',
      FOREIGN KEY (diligence_id) REFERENCES diligence(id)
    );

    CREATE TABLE IF NOT EXISTS investors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT,
      commitment REAL DEFAULT 0,
      called REAL DEFAULT 0,
      status TEXT,
      notes TEXT
    );

    -- Capital sources: JV equity partners, HNW investors, LOC providers.
    -- Structured to hold enough of a term sheet to answer "what's the deal
    -- with this partner" without opening the PDF.
    CREATE TABLE IF NOT EXISTS capital_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      short_name TEXT,
      kind TEXT,                       -- e.g. 'JV Equity — Programmatic', 'JV Equity — Deal-by-Deal', 'HNW Equity / LOC'
      status TEXT,                     -- 'Signed', 'Draft LOI', 'Verbal', 'Executed Note'
      primary_contact TEXT,
      headquarters TEXT,
      target_size TEXT,                -- '$X for Deal Y' / 'Programmatic — no cap' / '$X revolver'
      pref_pct REAL DEFAULT 0,         -- e.g. 8
      promote_summary TEXT,            -- multi-line waterfall summary
      geo_focus TEXT,
      strategy_fit TEXT,
      sponsor_skin_pct REAL,           -- required SPC principal contribution (%)
      asset_mgmt_fee_pct REAL,
      acq_fee_pct REAL,
      loan_rate_pct REAL,              -- if this source provides debt / LOC
      leverage_target_pct REAL,        -- LTC target if applicable
      hold_period TEXT,                -- '2-5 years' etc.
      exclusivity_notes TEXT,          -- ROFR/tail/non-compete notes
      signed_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS market_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date TEXT DEFAULT (date('now')),
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS openphone_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      last_sync_at TEXT,
      status TEXT CHECK(status IN ('ok','error')) DEFAULT 'ok',
      error_message TEXT,
      calls_synced INTEGER DEFAULT 0,
      messages_synced INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS openphone_settings (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      sync_enabled INTEGER DEFAULT 1,
      track_personal INTEGER DEFAULT 0,
      personal_number TEXT DEFAULT '317-750-0007'
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      description TEXT NOT NULL,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS lois (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER,
      sent_date TEXT,                      -- ISO date the LOI was emailed
      property TEXT,                       -- address as written in the LOI
      price REAL,
      sf INTEGER,
      acreage REAL,
      deposit REAL,
      dd_days INTEGER,
      close_days INTEGER,                  -- days after DD
      exclusivity_days INTEGER,
      leaseback TEXT,
      other_terms TEXT,
      version_note TEXT,                   -- e.g. "revised — price up from $X", "executed by seller"
      to_name TEXT,
      to_email TEXT,
      to_firm TEXT,
      attachment_name TEXT,
      message_id TEXT UNIQUE,              -- Outlook message id (dedupe key)
      outlook_link TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (deal_id) REFERENCES deals(id)
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,                       -- mining | shipping | construction | logistics | other
      start_date TEXT,
      end_date TEXT,
      location TEXT,
      url TEXT,
      cost TEXT,                           -- free-form (e.g. "$1,295" or "Free for members")
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS economic_releases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,                  -- e.g. "Nonfarm Payrolls"
      release_date TEXT NOT NULL,          -- ISO date
      release_time TEXT,                   -- e.g. "8:30 AM ET"
      previous_value TEXT,                 -- last reading
      consensus TEXT,                      -- forecast
      actual_value TEXT,                   -- once released
      interpretation TEXT,                 -- our take
      importance TEXT DEFAULT 'medium',    -- low | medium | high
      url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Migrate deals: add missing columns on existing DBs
  const dealCols = await db.execute("PRAGMA table_info(deals)");
  const dealColNames = dealCols.rows.map(r => String(r.name));
  const dealColsToAdd: { name: string; def: string }[] = [
    { name: 'pinned', def: 'INTEGER DEFAULT 0' },
    { name: 'city', def: 'TEXT' },
    { name: 'sf', def: 'INTEGER DEFAULT 0' },
    { name: 'occupancy', def: 'REAL DEFAULT 0' },
    { name: 'yoc_initial', def: 'REAL DEFAULT 0' },
    { name: 'equity_required', def: 'REAL DEFAULT 0' },
    { name: 'dd_days', def: 'INTEGER DEFAULT 0' },
    { name: 'close_date', def: 'TEXT' },
    { name: 'close_days', def: 'INTEGER DEFAULT 0' },
    { name: 'deposit', def: 'REAL DEFAULT 0' },
    { name: 'ownership_pct', def: 'REAL DEFAULT 100' },
    { name: 'state', def: 'TEXT' },
    { name: 'irr', def: 'REAL' },
    { name: 'em', def: 'REAL' },
    { name: 'all_in_basis', def: 'REAL' },
  ];
  for (const col of dealColsToAdd) {
    if (!dealColNames.includes(col.name)) {
      await db.execute(`ALTER TABLE deals ADD COLUMN ${col.name} ${col.def}`);
    }
  }

  // One-time normalization: old seed data stored YoC as percentages (8.2 = 8.2%).
  // New data stores as decimals (0.082). Any value > 1 is legacy percentage form.
  await db.execute('UPDATE deals SET yoc_target = yoc_target / 100.0 WHERE yoc_target > 1');
  await db.execute('UPDATE deals SET yoc_initial = yoc_initial / 100.0 WHERE yoc_initial > 1');
  await db.execute('UPDATE deals SET occupancy = occupancy / 100.0 WHERE occupancy > 1');

  // Stage rename: "Signed LOI" + "PSA Negotiation" → "Negotiating PSA"
  await db.execute("UPDATE deals SET stage = 'Negotiating PSA' WHERE stage = 'Signed LOI' OR stage = 'PSA Negotiation'");

  // Migrate contact_log if missing columns (existing DBs)
  const colInfo = await db.execute("PRAGMA table_info(contact_log)");
  const colNames = colInfo.rows.map(r => String(r.name));
  if (!colNames.includes('external_id')) {
    await db.execute('ALTER TABLE contact_log ADD COLUMN external_id TEXT');
  }
  if (!colNames.includes('source')) {
    await db.execute("ALTER TABLE contact_log ADD COLUMN source TEXT DEFAULT 'manual'");
  }

  // Seed openphone_settings if empty
  const settingsCount = await db.execute('SELECT COUNT(*) as c FROM openphone_settings');
  if (Number(settingsCount.rows[0].c) === 0) {
    await db.execute("INSERT INTO openphone_settings (id, sync_enabled, track_personal, personal_number) VALUES (1, 1, 0, '317-750-0007')");
  }

  // Deals are loaded via /api/seed-pipeline from the latest Acq Pipeline xlsx.
  // No auto-seed on empty — the dashboard just shows "0 active deals" until
  // the user (or the seed endpoint) inserts real ones.
}

