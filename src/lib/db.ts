import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'sandpiper.db');

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      market TEXT,
      submarket TEXT,
      acreage REAL,
      asking_price REAL,
      yoc_target REAL,
      zoning TEXT,
      ios_eligible INTEGER DEFAULT 1,
      stage TEXT DEFAULT 'Tracking',
      source TEXT,
      dd_expiry TEXT,
      notes TEXT,
      pinned INTEGER DEFAULT 0,
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
  `);

  // Migrate deals if missing pinned column (existing DBs)
  const dealCols = db.prepare("PRAGMA table_info(deals)").all() as { name: string }[];
  if (!dealCols.find(c => c.name === 'pinned')) {
    db.exec('ALTER TABLE deals ADD COLUMN pinned INTEGER DEFAULT 0');
  }

  // Migrate contact_log if missing columns (existing DBs)
  const colInfo = db.prepare("PRAGMA table_info(contact_log)").all() as { name: string }[];
  const colNames = colInfo.map(c => c.name);
  if (!colNames.includes('external_id')) {
    db.exec('ALTER TABLE contact_log ADD COLUMN external_id TEXT');
  }
  if (!colNames.includes('source')) {
    db.exec("ALTER TABLE contact_log ADD COLUMN source TEXT DEFAULT 'manual'");
  }

  // Seed openphone_settings if empty
  const settingsCount = db.prepare('SELECT COUNT(*) as c FROM openphone_settings').get() as { c: number };
  if (settingsCount.c === 0) {
    db.prepare("INSERT INTO openphone_settings (id, sync_enabled, track_personal, personal_number) VALUES (1, 1, 0, '317-750-0007')").run();
  }

  // Seed data if deals table is empty
  const count = db.prepare('SELECT COUNT(*) as c FROM deals').get() as { c: number };
  if (count.c === 0) {
    seed(db);
  }
}

function seed(db: Database.Database) {
  const insertDeal = db.prepare(`
    INSERT INTO deals (name, address, market, submarket, acreage, asking_price, yoc_target, zoning, ios_eligible, stage, source, dd_expiry, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertContact = db.prepare(`
    INSERT INTO contacts (deal_id, type, name, firm, phone, email, markets, warmth, last_contact, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDiligence = db.prepare(`
    INSERT INTO diligence (deal_id, category, vendor, due_date) VALUES (?, ?, ?, ?)
  `);

  const insertDiligenceItem = db.prepare(`
    INSERT INTO diligence_items (diligence_id, label, status) VALUES (?, ?, ?)
  `);

  const insertInvestor = db.prepare(`
    INSERT INTO investors (name, type, commitment, called, status, notes) VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertTask = db.prepare(`
    INSERT INTO tasks (contact_id, type, note, due_date, done) VALUES (?, ?, ?, ?, ?)
  `);

  const insertLog = db.prepare(`
    INSERT INTO contact_log (contact_id, type, note, date) VALUES (?, ?, ?, ?)
  `);

  const txn = db.transaction(() => {
    // Deal 1 - Tracking
    const d1 = insertDeal.run(
      'Port Houston Yard', '4200 Navigation Blvd, Houston, TX', 'Houston', 'Port Area',
      12.5, 8500000, 8.2, 'M-2 Heavy Industrial', 1, 'Tracking', 'CBRE Listing', null,
      'Prime IOS site near port. Currently used for container staging.'
    );

    // Deal 2 - LOI Submitted
    const d2 = insertDeal.run(
      'Inland Empire Depot', '1800 E Third St, San Bernardino, CA', 'Inland Empire', 'West San Bernardino',
      8.3, 6200000, 7.5, 'IL Industrial Light', 1, 'LOI Submitted', 'Broker Referral', null,
      'Paved yard with perimeter fencing. Near I-10/I-215 interchange.'
    );

    // Deal 3 - Under Contract
    const d3 = insertDeal.run(
      'Savannah Logistics Yard', '500 W Lathrop Ave, Savannah, GA', 'Savannah', 'Garden City',
      15.0, 11000000, 9.1, 'I-H Heavy Industrial', 1, 'Under Contract', 'Off-Market',
      '2026-04-25',
      'Adjacent to port intermodal facility. Excellent truck access.'
    );

    // Deal 4 - Closed
    const d4 = insertDeal.run(
      'DFW Truck Terminal', '3300 Chalk Hill Rd, Dallas, TX', 'DFW', 'West Dallas',
      6.8, 4100000, 8.8, 'PD Industrial', 1, 'Closed', 'JLL Listing', null,
      'Closed Q1 2026. Fully stabilized with 3 tenants.'
    );

    // Contacts
    const c1 = insertContact.run(d1.lastInsertRowid, 'broker', 'Mark Thompson', 'CBRE', '713-555-0142', 'mthompson@cbre.com', 'Houston', 'hot', '2026-04-01', 'Primary listing broker');
    const c2 = insertContact.run(d1.lastInsertRowid, 'owner', 'Garcia Family Trust', 'Self', '713-555-0198', null, 'Houston', 'warm', '2026-03-28', 'Family trust, 2nd generation');
    const c3 = insertContact.run(d2.lastInsertRowid, 'broker', 'Lisa Chen', 'Marcus & Millichap', '909-555-0167', 'lchen@marcusmillichap.com', 'Inland Empire, LA', 'hot', '2026-04-02', 'Responsive, knows the market well');
    const c4 = insertContact.run(d3.lastInsertRowid, 'broker', 'James Wright', 'Colliers', '912-555-0133', 'jwright@colliers.com', 'Savannah', 'warm', '2026-03-30', 'Represented seller');
    insertContact.run(d3.lastInsertRowid, 'owner', 'Savannah Port Holdings LLC', 'SPH', '912-555-0100', 'info@sph.com', 'Savannah', 'cool', '2026-03-15', 'Institutional seller');
    const c6 = insertContact.run(d4.lastInsertRowid, 'broker', 'Rachel Adams', 'JLL', '214-555-0188', 'radams@jll.com', 'DFW', 'hot', '2026-04-03', 'Great relationship, sourced DFW deal');

    // Tasks
    insertTask.run(c1.lastInsertRowid, 'call', 'Follow up on updated financials', '2026-04-06', 0);
    insertTask.run(c3.lastInsertRowid, 'email', 'Send LOI draft for review', '2026-04-04', 1);
    insertTask.run(c4.lastInsertRowid, 'call', 'Discuss inspection access schedule', '2026-04-07', 0);
    insertTask.run(c6.lastInsertRowid, 'coffee', 'Quarterly catch-up meeting', '2026-04-10', 0);
    insertTask.run(c2.lastInsertRowid, 'call', 'Check seller motivation', '2026-04-03', 0);

    // Contact log
    insertLog.run(c1.lastInsertRowid, 'call', 'Discussed pricing expectations. Seller firm at $8.5M.', '2026-04-01');
    insertLog.run(c3.lastInsertRowid, 'email', 'Sent initial offer terms.', '2026-04-02');
    insertLog.run(c4.lastInsertRowid, 'call', 'Confirmed PSA execution. DD period starts April 5.', '2026-03-30');
    insertLog.run(c6.lastInsertRowid, 'coffee', 'Met at downtown Dallas. Discussed pipeline opportunities.', '2026-03-25');

    // Diligence for Under Contract deal (Savannah)
    const categories = [
      { cat: 'site', vendor: 'ATC Group Services', due: '2026-04-15', items: ['Schedule site visit', 'Photo documentation', 'Access road assessment'] },
      { cat: 'env', vendor: 'Terracon', due: '2026-04-18', items: ['Phase I ESA', 'Phase II if needed', 'UST search'] },
      { cat: 'pca', vendor: 'EMG', due: '2026-04-20', items: ['Property condition assessment', 'Capital reserves estimate'] },
      { cat: 'survey', vendor: 'Thomas & Hutton', due: '2026-04-16', items: ['ALTA survey', 'Boundary confirmation', 'Easement identification'] },
      { cat: 'roof', vendor: 'Roof Tech', due: '2026-04-17', items: ['Roof inspection report', 'Remaining useful life estimate'] },
      { cat: 'contractor', vendor: 'Haskell Co', due: '2026-04-22', items: ['CapEx bid - paving', 'CapEx bid - fencing', 'CapEx bid - lighting'] },
      { cat: 'zoning', vendor: 'Smith Gambrell', due: '2026-04-19', items: ['Zoning confirmation letter', 'Permitted use analysis', 'Variance requirements'] },
    ];

    for (const c of categories) {
      const dil = insertDiligence.run(d3.lastInsertRowid, c.cat, c.vendor, c.due);
      for (let i = 0; i < c.items.length; i++) {
        const status = i === 0 ? 'complete' : i === 1 ? 'in-progress' : 'pending';
        insertDiligenceItem.run(dil.lastInsertRowid, c.items[i], status);
      }
    }

    // Investors
    insertInvestor.run('Meridian Capital Partners', 'Family Office', 5000000, 2000000, 'Active', 'Lead investor. Committed to Fund I.');
    insertInvestor.run('Lakeshore Ventures', 'HNW Individual', 2500000, 1000000, 'Active', 'Interested in IOS thesis.');
    insertInvestor.run('Bluewater Holdings', 'Institutional', 10000000, 0, 'Prospecting', 'Initial meeting scheduled for April.');
    insertInvestor.run('Cypress Grove Family Office', 'Family Office', 3000000, 1500000, 'Active', 'Co-invested on DFW deal.');

    // Market snapshot
    const marketData = {
      rates_debt: {
        sofr: 4.33,
        treasury_10y: 4.25,
        agency_spread: 165,
        bridge_spread: 350,
        cmbs_spread: 200,
        last_updated: '2026-04-01',
      },
      ios_fundamentals: {
        avg_rent_psf: 5.25,
        vacancy_rate: 4.2,
        absorption_sqft: 12500000,
        new_supply_sqft: 3200000,
        cap_rate_range: '6.5% - 8.5%',
        last_updated: '2026-04-01',
      },
      imports_freight: {
        teu_ytd: 8750000,
        teu_yoy_change: 3.2,
        avg_freight_rate: 2150,
        freight_yoy_change: -5.1,
        trucking_index: 112.5,
        last_updated: '2026-04-01',
      },
      port_volumes: {
        ports: [
          { name: 'Los Angeles/Long Beach', teu_monthly: 875000, yoy: 2.1 },
          { name: 'Savannah', teu_monthly: 520000, yoy: 5.8 },
          { name: 'Houston', teu_monthly: 315000, yoy: 3.4 },
          { name: 'New York/New Jersey', teu_monthly: 680000, yoy: 1.9 },
          { name: 'Charleston', teu_monthly: 245000, yoy: 4.2 },
        ],
        last_updated: '2026-04-01',
      },
    };

    db.prepare('INSERT INTO market_snapshots (snapshot_date, data) VALUES (?, ?)').run(
      '2026-04-01',
      JSON.stringify(marketData)
    );
  });

  txn();
}
