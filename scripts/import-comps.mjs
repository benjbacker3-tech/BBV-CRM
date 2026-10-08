#!/usr/bin/env node
// Import lease comps, sale comps and availabilities from the West Region tracking workbook.
//
//   node scripts/import-comps.mjs "<path>/West Region Tracking - BB.xlsx" --dry-run
//   node scripts/import-comps.mjs "<path>/West Region Tracking - BB.xlsx"            # insert new rows
//   node scripts/import-comps.mjs "<path>/West Region Tracking - BB.xlsx" --replace  # wipe prior imports first
//
// Each tab is a market. Rent is normalized to total $/month (tabs disagree on what
// "$ PSF" means: Seattle = $/land SF/month, the rest = $/building SF/year).
// Re-running without --replace skips rows already imported (keyed by tab + row).
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { createClient } from '@libsql/client';

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const DRY = args.includes('--dry-run');
const REPLACE = args.includes('--replace');
if (!file) { console.error('Usage: node scripts/import-comps.mjs <workbook.xlsx> [--dry-run] [--replace]'); process.exit(1); }

for (const f of ['.env.local', '.env']) {
  if (!fs.existsSync(f)) continue;
  for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const MARKET_STATE = { Seattle: 'WA', Denver: 'CO', Phoenix: 'AZ', 'Salt Lake City': 'UT', 'Las Vegas': 'NV', SF: 'CA', IE: 'CA', LA: 'CA', Terminals: 'CO' };
const SQFT_PER_ACRE = 43560;
// The IE tab has a block of Phoenix comps pasted in with shifted columns; they're already on the Phoenix tab.
const IE_SKIP_CITIES = new Set(['phoenix', 'tempe', 'glendale', 'mesa']);
const FIX = { 'Mainteance': 'Maintenance', 'Contrator': 'Contractor', 'Commcerce City': 'Commerce City', 'Steal Peak': 'Steel Peak' };
const SOURCE_FILE = path.basename(file);

// ── cell helpers ─────────────────────────────────────────────────────────────
const raw = v => (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v ? v.result : v);
const text = v => {
  v = raw(v);
  if (v == null) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') return v.richText ? v.richText.map(t => t.text).join('') : v.text ?? null;
  const s = String(v).trim();
  return s ? (FIX[s] ?? s) : null;
};
const num = v => {
  v = raw(v);
  if (v == null || v instanceof Date || typeof v === 'object') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
  return isFinite(n) ? n : null;
};
const isoDate = v => {
  v = raw(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number' && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  return null;
};
// Bumps were sometimes typed as "3" (=3%) or got date-formatted (1900-01-03 = serial 4 → 4%).
const bumps = v => {
  v = raw(v);
  let n = v instanceof Date ? Math.round((v.getTime() - Date.UTC(1899, 11, 30)) / 86400000) : num(v);
  if (n == null || n <= 0) return null;
  return n >= 1 ? n / 100 : n;
};

const TITLE = /^(lease comps|sale comps|availabilities|comps|orange county)/i;

// ── parse ────────────────────────────────────────────────────────────────────
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const comps = [];
const skipped = [];

for (const ws of wb.worksheets) {
  const market = ws.name;
  let title = null, kind = null, headers = null, inlineAvail = false, moneyCol = -1;

  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const cell = c => row.getCell(c).value;
    const B = text(cell(2)), C = text(cell(3));

    if (B && /^tenants in market/i.test(B)) { title = kind = headers = null; continue; }
    if (B && TITLE.test(B) && !C) {
      title = B; headers = null; inlineAvail = false;
      kind = /sale/i.test(B) ? 'sale' : /availab/i.test(B) ? 'availability' : 'lease';
      // LA's two "Orange County:" blocks: the band row under the title says "Asking Rent" for listings.
      if (/orange county/i.test(B)) {
        const band = ws.getRow(r + 1).values.map(text).filter(Boolean).join(' ');
        kind = /asking/i.test(band) ? 'availability' : 'lease';
      }
      continue;
    }
    if (title && C === 'Address') {
      headers = [];
      const seen = {};
      for (let c = 2; c <= ws.columnCount; c++) {
        const label = (text(cell(c)) || '').toLowerCase();
        seen[label] = (seen[label] || 0) + 1;
        headers[c] = seen[label] > 1 ? `${label}#${seen[label]}` : label;
      }
      if (B === 'Status' || B === 'No.') kind = 'availability';
      moneyCol = headers.indexOf('$s');
      continue;
    }
    if (!headers) continue;

    // IE puts an "Availabilities" marker in the Date column of the first listing row
    let markerRow = false;
    if (B && /^availabilities$/i.test(B) && C) { inlineAvail = true; markerRow = true; }

    const get = label => { const c = headers.indexOf(label); return c >= 0 ? cell(c) : null; };
    const address = text(get('address'));
    if (!address) continue;

    const rec = { kind, market, state: MARKET_STATE[market] ?? null };
    let psf = null, plf = null, perAcre = null, money = null;
    for (let c = 2; c < headers.length; c++) {
      const h = headers[c], v = cell(c);
      if (!h || v == null) continue;
      switch (h) {
        case 'date': if (!markerRow) { const d = isoDate(v); if (d) rec.comp_date = d; else if (text(v)) rec.status = text(v); } break;
        case 'status': rec.status = text(v); break;
        case 'address': rec.address = address; break;
        case 'city': case 'landlord': case 'tenant': case 'buyer': case 'seller':
        case 'submarket': case 'zoning': case 'broker': case 'yard': case 'fence': case 'lit':
          rec[h] = text(v); break;
        case 'details': rec.notes = text(v); break;
        case 'sf': case 'bsf': rec.sf = num(v); break;
        case 'acres': rec.acres = num(v); break;
        // In sale sections a Type column right of the price is the marketing status (Off Market, Fully Marketed)
        case 'type': case 'type#2':
          if (kind === 'sale' && moneyCol > 0 && c > moneyCol) rec.marketing = text(v); else rec.property_type = text(v);
          break;
        case '$s': money = num(v); break;
        case '$ psf': psf = num(v); break;
        case '$ plf': case '$plf': plf = num(v); break;
        case '$ acre': perAcre = num(v); break;
        case 'nnn': rec.nnn_plf = num(v); break;
        case 'bumps': rec.bumps = bumps(v); break;
        case 'term (mos)': rec.term_months = num(v); break;
        case 'term': rec.occupancy_note = text(v); break;
        case 'iov price': rec.alt_price = num(v); break;
        case 'available date': rec.available_date = isoDate(v); break;
        case 'time on market': rec.tom_months = num(v); break;
        case 'doors': rec.doors = num(v); break;
        case 'depth': rec.depth = num(v); break;
      }
    }

    if (rec.sf != null && rec.sf < 50) rec.sf = null;   // stray 0 / 0.3 entries
    if (rec.acres != null && rec.acres <= 0) rec.acres = null;

    if (kind === 'sale') {
      rec.price = money;
    } else {
      // Total monthly rent from whichever basis the tab used
      if (money) rec.rent_monthly = money;
      else if (plf != null || (market === 'Seattle' && psf != null)) {
        const p = plf ?? psf;
        if (rec.acres) rec.rent_monthly = p * rec.acres * SQFT_PER_ACRE; else rec.rent_plf = p;
      } else if (psf != null && rec.sf) rec.rent_monthly = (psf * rec.sf) / 12;
      else if (perAcre != null && rec.acres) rec.rent_monthly = perAcre * rec.acres;
    }
    if (rec.available_date) delete rec.tom_months;

    const signedLease = rec.comp_date && rec.tenant && !/^vacant$/i.test(rec.tenant);
    if (inlineAvail && !signedLease) rec.kind = 'availability';
    else if (rec.kind === 'lease' && !rec.comp_date && /^vacant$/i.test(rec.tenant || '')) rec.kind = 'availability';
    if (rec.kind === 'availability' && /^vacant$/i.test(rec.tenant || '')) rec.tenant = null;

    const hasData = [rec.sf, rec.acres, rec.rent_monthly, rec.rent_plf, rec.price].some(x => x != null);
    if (!hasData) { skipped.push(`${market} R${r} "${address}" — no figures (note row)`); continue; }
    if (market === 'IE' && IE_SKIP_CITIES.has((rec.city || '').toLowerCase())) { skipped.push(`${market} R${r} "${address}, ${rec.city}" — Phoenix comp duplicated on IE tab`); continue; }

    rec.source = 'import';
    rec.review_status = 'approved';
    rec.source_note = `${SOURCE_FILE} · ${market} row ${r}`;
    comps.push(rec);
  }
}

// ── summary ──────────────────────────────────────────────────────────────────
const tally = {};
for (const c of comps) { const k = `${c.market}`; tally[k] ??= { lease: 0, sale: 0, availability: 0 }; tally[k][c.kind]++; }
console.log(`${DRY ? '[DRY RUN] ' : ''}Parsed ${comps.length} comps from ${SOURCE_FILE}\n`);
console.log('market            lease  sale  avail');
for (const [m, t] of Object.entries(tally)) console.log(`${m.padEnd(16)} ${String(t.lease).padStart(6)} ${String(t.sale).padStart(5)} ${String(t.availability).padStart(6)}`);
if (skipped.length) { console.log(`\nSkipped ${skipped.length}:`); for (const s of skipped) console.log(`  - ${s}`); }

if (DRY) {
  console.log('\nSample rows:');
  for (const c of [comps.find(x => x.market === 'Seattle'), comps.find(x => x.market === 'Denver' && x.kind === 'sale'), comps.find(x => x.market === 'IE' && x.kind === 'availability'), comps.find(x => x.market === 'LA')].filter(Boolean)) {
    console.log(' ', JSON.stringify(c));
  }
  console.log('\n[DRY RUN] nothing written.');
  process.exit(0);
}

// ── write ────────────────────────────────────────────────────────────────────
const url = process.env.TURSO_DATABASE_URL || 'file:sandpiper.db';
const db = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

// Create the table from the app's own schema if the app hasn't booted against this DB yet.
const ddl = fs.readFileSync('src/lib/db.ts', 'utf8').replace(/\r\n/g, '\n').match(/CREATE TABLE IF NOT EXISTS comps \([\s\S]*?\n {4}\);\n {4}CREATE INDEX[^\n]*/);
if (!ddl) { console.error('Could not find the comps schema in src/lib/db.ts'); process.exit(1); }
await db.executeMultiple(ddl[0]);

if (REPLACE) {
  const r = await db.execute("DELETE FROM comps WHERE source = 'import'");
  console.log(`\nRemoved ${r.rowsAffected} previously imported comps.`);
}

const existing = new Set((await db.execute("SELECT source_note FROM comps WHERE source = 'import'")).rows.map(r => String(r.source_note)));
const stmts = [];
for (const c of comps) {
  if (existing.has(c.source_note)) continue;
  const keys = Object.keys(c).filter(k => c[k] !== undefined);
  stmts.push({ sql: `INSERT INTO comps (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, args: keys.map(k => c[k] ?? null) });
}
for (let i = 0; i < stmts.length; i += 100) await db.batch(stmts.slice(i, i + 100));
console.log(`\nInserted ${stmts.length} comps into ${url.startsWith('file:') ? url : url.replace(/\/\/.*@/, '//')}${comps.length - stmts.length ? ` (${comps.length - stmts.length} already imported)` : ''}.`);
