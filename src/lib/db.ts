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
      fee_acq REAL,                         -- sponsor fees from the deal model (Assumptions tab), total $
      fee_construction REAL,                -- "Development Fee" in the model
      fee_leasing REAL,
      fee_am REAL,                          -- asset mgmt fee over the whole hold
      hold_months REAL,
      drive_folder_id TEXT,                 -- OneDrive item id of the deal folder
      drive_folder_path TEXT,
      model_item_id TEXT,                   -- OneDrive item id of the model the numbers came from
      model_name TEXT,
      model_modified TEXT,
      model_synced_at TEXT,
      napkin TEXT,                          -- saved Napkin Math (JSON, lib/napkin.ts)
      lat REAL,                             -- map pin (Map tab)
      lng REAL,
      geo TEXT,                             -- 'census' or 'osm' (looked up; osm is approximate), 'manual' (placed by hand) or 'none' (not found)
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

    -- Deal checklists (see lib/dd-template.ts). list 'dd' = SPC Diligence Checklist, created
    -- from the template the first time a deal's checklist is opened; list 'cm' = Construction
    -- Oversight Checklist, started by hand. One row per line per deal.
    -- status: open | in_progress | done | na.
    CREATE TABLE IF NOT EXISTS dd_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      list TEXT NOT NULL DEFAULT 'dd',      -- dd | cm
      item_key TEXT NOT NULL,               -- template key, or custom-<n> for added rows
      section TEXT NOT NULL,
      grp TEXT,                             -- sub-heading (Ownership Materials only)
      label TEXT NOT NULL,
      sort INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done','na')),
      vendor TEXT,
      note TEXT,
      due_date TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(deal_id, item_key),
      FOREIGN KEY (deal_id) REFERENCES deals(id)
    );

    -- Diligence spend: one row per proposal / engagement. Amount is the proposal until an
    -- invoice comes in. status: proposal | signed | invoiced | paid | declined.
    CREATE TABLE IF NOT EXISTS dd_costs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      category TEXT NOT NULL,               -- Legal, Phase I, PCA, Survey, ...
      vendor TEXT,
      proposal_amount REAL,
      invoice_amount REAL,
      status TEXT NOT NULL DEFAULT 'proposal' CHECK(status IN ('proposal','signed','invoiced','paid','declined')),
      paid_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (deal_id) REFERENCES deals(id)
    );
    CREATE INDEX IF NOT EXISTS ix_dd_costs_deal ON dd_costs(deal_id);

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

    -- Lease comps, sale comps and availabilities. Rent is stored once as total
    -- monthly rent; $/LSF/mo, $/BSF/yr, $/acre/mo etc. are derived (see lib/comps.ts).
    CREATE TABLE IF NOT EXISTS comps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK(kind IN ('lease','sale','availability')),
      market TEXT,                          -- workbook tab: Seattle, Denver, Phoenix, ...
      status TEXT,                          -- e.g. Pending (sale), SELLING (availability)
      comp_date TEXT,                       -- lease commencement / sale close
      available_date TEXT,
      address TEXT NOT NULL,
      city TEXT,
      state TEXT,
      submarket TEXT,
      landlord TEXT,
      tenant TEXT,
      buyer TEXT,
      seller TEXT,
      property_type TEXT,                   -- Equipment, Trailer, Contractor, Maintenance, Terminal
      sf REAL,                              -- building SF
      acres REAL,
      rent_monthly REAL,                    -- total $/month (lease, or asking for availabilities)
      rent_plf REAL,                        -- $/land SF/month, only when acres are unknown
      nnn_plf REAL,                         -- $/land SF/month
      price REAL,                           -- sale price
      alt_price REAL,                       -- "IOV Price" column
      bumps REAL,                           -- decimal (0.035 = 3.5%)
      term_months REAL,
      broker TEXT,
      zoning TEXT,
      yard TEXT,
      fence TEXT,
      lit TEXT,
      doors REAL,
      depth REAL,
      occupancy_note TEXT,                  -- sale "Term" column: Vacant, Less than 1Y, ...
      marketing TEXT,                       -- Off Market, Fully Marketed, ...
      notes TEXT,
      tom_months REAL,                      -- time on market, when there's no available_date
      review_status TEXT NOT NULL DEFAULT 'approved' CHECK(review_status IN ('pending','approved','rejected')),
      source TEXT NOT NULL DEFAULT 'manual', -- manual | import | email
      source_ref TEXT,                      -- Outlook message id for email-sourced comps
      source_note TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_comps_kind_market ON comps(kind, market, review_status);

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

    -- Small key/value store (e.g. the email scan watermark).
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Email attachments seen by the filing scan (see lib/mail-filing.ts). One row per
    -- attachment; status: filed | review | dismissed | skipped.
    CREATE TABLE IF NOT EXISTS email_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT NOT NULL,
      attachment_id TEXT NOT NULL,
      conversation_id TEXT,
      received_at TEXT,
      sender TEXT,
      subject TEXT,
      web_link TEXT,
      file_name TEXT NOT NULL,
      size INTEGER,
      deal_id INTEGER,                     -- matched or chosen deal
      folder TEXT,                         -- standard subfolder, e.g. "03 Diligence"
      status TEXT NOT NULL,
      reason TEXT,
      drive_item_id TEXT,
      drive_web_url TEXT,
      filed_at TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(message_id, attachment_id)
    );
    CREATE INDEX IF NOT EXISTS ix_email_files_status ON email_files(status, received_at);
    CREATE INDEX IF NOT EXISTS ix_email_files_conv ON email_files(conversation_id);

    -- Share links for vendors / consultants (see lib/shares.ts). mode: view | upload | both.
    CREATE TABLE IF NOT EXISTS shares (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL CHECK(mode IN ('view','upload','both')),
      item_id TEXT NOT NULL,
      item_name TEXT NOT NULL,
      item_path TEXT,
      is_folder INTEGER NOT NULL DEFAULT 1,
      deal_id INTEGER,
      recipient TEXT NOT NULL,
      recipient_email TEXT,
      password_hash TEXT,
      expires_at TEXT,
      notify INTEGER NOT NULL DEFAULT 1,
      revoked_at TEXT,
      last_access_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS share_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      share_id INTEGER NOT NULL,
      kind TEXT NOT NULL,                  -- open | download | upload | upload_start | bad_password
      detail TEXT,
      ip TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_share_events_share ON share_events(share_id, created_at);

    -- Failed CRM sign-ins, for throttling (see api/auth/login).
    CREATE TABLE IF NOT EXISTS auth_failures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_auth_failures ON auth_failures(created_at);

    -- Personal properties (Clayton, Emerson): Ben's own holdings, moved here from the old
    -- property-accounting app. Kept in their own tables, outside every Sandpiper total,
    -- export, search and share link. Ids are text (carried over from the old app).
    CREATE TABLE IF NOT EXISTS personal_properties (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      entity TEXT,
      est_value REAL DEFAULT 0,
      loan_balance REAL DEFAULT 0,
      loan_servicer TEXT,
      loan_servicer_url TEXT,
      loan_number TEXT,
      loan_rate REAL,
      loan_payment REAL DEFAULT 0,
      loan_matures TEXT,
      bank_name TEXT,
      bank_last_four TEXT,
      tenant_name TEXT,
      tenant_rent REAL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS personal_utility_bills (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      month TEXT NOT NULL,                  -- YYYY-MM
      utility_type TEXT NOT NULL,           -- water | trash | stormwater
      amount_paid REAL,
      date_paid TEXT,
      amount_recharged REAL,
      date_recharged TEXT,
      recharge_method TEXT,
      notes TEXT,
      UNIQUE(property_id, month, utility_type)
    );
    CREATE TABLE IF NOT EXISTS personal_checkins (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      month TEXT NOT NULL,                  -- YYYY-MM
      rent_received INTEGER DEFAULT 0,
      rent_received_date TEXT,
      rent_amount REAL,
      mortgage_paid INTEGER DEFAULT 0,
      mortgage_paid_date TEXT,
      notes TEXT,
      completed_at TEXT,
      UNIQUE(property_id, month)
    );
    CREATE TABLE IF NOT EXISTS personal_reminders (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      name TEXT NOT NULL,
      due_date TEXT NOT NULL,
      category TEXT DEFAULT 'Other',
      amount REAL,
      recurring INTEGER DEFAULT 0,
      recur_months INTEGER,
      notes TEXT,
      dismissed INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS personal_transactions (
      id TEXT PRIMARY KEY,
      property_id TEXT NOT NULL,
      date TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      type TEXT NOT NULL,                   -- Income | Expense
      amount REAL NOT NULL,
      source TEXT,                          -- checkin | utility:<month>:<type> | note-payment | NULL (imported)
      notes TEXT
    );
    CREATE INDEX IF NOT EXISTS ix_personal_tx ON personal_transactions(property_id, date);
    -- Payments on the note Dan owes on Emerson (old app: dan_payments).
    CREATE TABLE IF NOT EXISTS personal_note_payments (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      amount REAL NOT NULL,
      principal REAL NOT NULL,
      interest REAL NOT NULL,
      balance_after REAL NOT NULL,
      created_at TEXT DEFAULT ''
    );

    -- Asset bulletin for Sandpiper's closed deals: key dates (lease, insurance, tax, loan
    -- renewals) and running notes. The property manager handles day-to-day items; this is
    -- what Ben needs to see coming. A recurring date rolls forward when marked done.
    CREATE TABLE IF NOT EXISTS asset_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('date','note')),
      category TEXT DEFAULT 'Other',        -- Lease, Insurance, Tax, Loan, Entity, Property, Other
      title TEXT NOT NULL DEFAULT '',
      body TEXT,                            -- note text, or details for a date
      due_date TEXT,                        -- YYYY-MM-DD; null = date not set yet
      recur_months INTEGER,                 -- repeats every N months; null = one-time
      lead_days INTEGER DEFAULT 60,         -- start flagging this many days ahead
      last_done TEXT,                       -- when a recurring date was last marked done
      done_at TEXT,                         -- one-time date completed (hidden from upcoming)
      pinned INTEGER DEFAULT 0,             -- notes: keep at the top
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_asset_items_deal ON asset_items(deal_id, kind);

    -- Broker leads: offering emails found in the mailbox (lib/leads.ts), parsed for address,
    -- price and size, waiting for Ben to add them to the Pipeline or dismiss them. One row per
    -- listing; a repeat blast of the same listing bumps times_seen instead of adding a row.
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message_id TEXT UNIQUE NOT NULL,
      conversation_id TEXT,
      received_at TEXT NOT NULL,
      sender_name TEXT,
      sender_email TEXT,
      firm TEXT,
      subject TEXT,
      preview TEXT,
      web_link TEXT,
      attachments TEXT,                     -- JSON array of attachment names
      why TEXT,                             -- what made it a lead (subject / attachment)
      address TEXT,
      city TEXT,
      state TEXT,
      price REAL,
      acres REAL,
      sf REAL,
      cap_rate REAL,
      status TEXT DEFAULT 'new' CHECK(status IN ('new','kept','dismissed')),
      deal_id INTEGER,                      -- the Tracking deal created from it
      match_deal_id INTEGER,                -- an existing deal at the same address
      times_seen INTEGER DEFAULT 1,
      last_seen_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS ix_leads_status ON leads(status, received_at);
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
    { name: 'fee_acq', def: 'REAL' },
    { name: 'fee_construction', def: 'REAL' },
    { name: 'fee_leasing', def: 'REAL' },
    { name: 'fee_am', def: 'REAL' },
    { name: 'hold_months', def: 'REAL' },
    { name: 'drive_folder_id', def: 'TEXT' },
    { name: 'drive_folder_path', def: 'TEXT' },
    { name: 'model_item_id', def: 'TEXT' },
    { name: 'model_name', def: 'TEXT' },
    { name: 'model_modified', def: 'TEXT' },
    { name: 'model_synced_at', def: 'TEXT' },
    { name: 'napkin', def: 'TEXT' },              // saved Napkin Math (JSON, lib/napkin.ts)
    { name: 'lat', def: 'REAL' },                 // map pin (Map tab)
    { name: 'lng', def: 'REAL' },
    { name: 'geo', def: 'TEXT' },                 // 'census' or 'osm' (looked up; osm is approximate), 'manual' (placed by hand) or 'none' (not found)
  ];
  for (const col of dealColsToAdd) {
    if (!dealColNames.includes(col.name)) {
      await db.execute(`ALTER TABLE deals ADD COLUMN ${col.name} ${col.def}`);
    }
  }

  // email_files.rules_version: which filing rules decided a row (see lib/mail-filing.ts).
  const efCols = (await db.execute('PRAGMA table_info(email_files)')).rows.map(r => String(r.name));
  if (!efCols.includes('rules_version')) await db.execute('ALTER TABLE email_files ADD COLUMN rules_version INTEGER DEFAULT 0');

  // dd_items.list: diligence vs construction checklist.
  const ddCols = (await db.execute('PRAGMA table_info(dd_items)')).rows.map(r => String(r.name));
  if (!ddCols.includes('list')) await db.execute("ALTER TABLE dd_items ADD COLUMN list TEXT NOT NULL DEFAULT 'dd'");

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

