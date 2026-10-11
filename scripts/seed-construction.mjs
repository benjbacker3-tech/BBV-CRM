// One-time load of the construction oversight checklists for 724 W Taylor (S-Bar) and
// 6371 Nesbitt (TJK), from a 10/11/2026 read of the construction contracts in each deal's
// "09 Construction" folder. Dates marked "(inferred)" aren't stated in the contracts.
//
//   node --env-file=.env.local scripts/seed-construction.mjs --dry-run   # preview
//   node --env-file=.env.local scripts/seed-construction.mjs             # apply
//
// Non-destructive: template lines are only filled while still blank (status open, no
// vendor, no note, no due date), and contract lines are only added if missing.
import { createClient } from '@libsql/client';
import { CM_TEMPLATE, CONTRACT_SECTION } from '../src/lib/dd-template.ts';

const dry = process.argv.includes('--dry-run');
const db = createClient({ url: process.env.TURSO_DATABASE_URL || 'file:sandpiper.db', authToken: process.env.TURSO_AUTH_TOKEN });

// Template lines: [item_key, status, vendor, note, due_date]
// Contract lines: [item_key, label, status, note, due_date]
const PROJECTS = {
  '724 Taylor': {
    template: [
      ['cm_budget', 'done', 'S-Bar', 'R2.1 proposal 8/27: $779,364.14 (contract §3.1 says $780,000)'],
      ['cm_contract', 'done', 'S-Bar', 'Fixed Fee Commercial Remodel Contract SBAR-2026-056, executed 9/28. Optional scope ($233,988: fence, roof coating, grading) not included'],
      ['cm_start', 'done', null, 'Commenced 9/28 (Exh. B)', '2026-09-28'],
      ['cm_est_completion', 'in_progress', null, 'Est. Substantial Completion 11/22 (Exh. B). Final Completion date not stated; §5.2 is "commercially reasonable efforts", no LDs', '2026-11-22'],
      ['cm_draw_structure', 'done', null, 'Milestones 30% signing / 30% at 50% / 30% at SC / 10% at Final (Exh. C). Pay 10 business days after complete pay app (§4.2) — Exh. C note says 30 days. 10% retainage (§4.8)'],
      ['cm_gc_insurance', 'in_progress', 'S-Bar', 'COI v2 10/5 (AI: FIB, Taylor IOS, RBNB). Gaps: GL aggregate per policy not per project; auto lacks owned autos; delivered after start. No builder\'s risk required'],
      ['cm_permits', 'open', 'S-Bar', 'Contract §7.1/7.3: GC pulls permits, in price — but R2.1 note 4 excludes permits and calls for a CO. Resolve'],
      ['cm_lien_forms', 'in_progress', 'S-Bar', 'W-9 + ACH info on file. Waivers required from subs/suppliers ≥ $10k (§11.3)'],
      ['cm_draw_setup', 'open', 'First Interstate', 'Lender inspector may verify pay apps (§4.3); GC signs lender consent within 5 business days of request (§1.6). Draw timing not in contract'],
      ['cm_ntp', 'done', null, 'Work started 9/28'],
      ['cm_weekly_report', 'open', 'S-Bar', 'Updated schedule each pay app. Milestones: demo 10/23, framing 10/30, rough MEP 11/6, drywall 11/11, finishes 11/13, punch 11/16–11/18'],
      ['cm_timing', 'open', null, 'Recovery plan within 5 business days of request if > 10 days behind (§5.7)'],
      ['cm_payapp_checked', 'open', null, 'Backup per §4.3: G702/G703, % complete per line, conditional waivers (GC + subs) current period, unconditional prior, proof subs paid, updated schedule. Dispute in writing within 5 calendar days (§4.4)'],
      ['cm_contingency', 'open', null, 'No contingency in the contract (§3.5 points to Exh. A, which has none)'],
      ['cm_co_written', 'open', null, 'Written CO on Exh. F form, signed by both. GC proposes within 7 days; owner approves/rejects in writing within 5 calendar days — silence = rejection (§6.3). Authorized signatory only'],
      ['cm_sc_cert', 'open', null, 'Needs passed inspections, CO, systems tested, owner written confirmation after joint walk + written punch list (§5.4)', '2026-11-22'],
      ['cm_punch', 'open', null, 'Punch 11/16–11/18 (Exh. B)', '2026-11-18'],
      ['cm_co_cert', 'open', null, 'Required for Substantial Completion (§5.4)'],
      ['cm_asbuilts', 'open', null, 'Warranties assigned at Final Completion (§13.4). As-builts / O&Ms not in contract — request'],
      ['cm_final_waivers', 'open', null, 'All tiers + sworn statement (§11.2)'],
      ['cm_retainage', 'open', null, 'Final payment (incl. retainage) due 30 days after Final Completion, final pay app, final waivers and warranties (§4.7)'],
      ['cm_warranty_walk', 'open', null, '1-yr warranty runs from Final Completion (§13.1); date shown assumes 11/22 — move it once Final Completion is known (inferred)', '2027-10-22'],
    ],
    contract: [
      ['cmx_inv1', 'Pay Invoice #01: $233,809.24 (site mobilization 30%) — get a progress-type conditional waiver first (the one sent is "Upon Final Payment")', 'in_progress', 'Invoice 26-047-RBN-TAYLOR-01 dated 9/30, ACH. Also missing G702/703 and sub waivers', '2026-10-15'],
      ['cmx_retainage', 'Confirm 10% retainage — Invoice #01 shows 0% retention (§4.8 says 10%)', 'open'],
      ['cmx_selections', 'Owner selections to S-Bar', 'open', 'All selections due 10/30 (Exh. B)', '2026-10-30'],
      ['cmx_payapp2', 'Pay App #2 at 50% complete: G702/703, conditional waivers all tiers, unconditional for #01, lender inspection', 'open', 'Expected late Oct / early Nov (inferred)'],
      ['cmx_price', 'Reconcile contract sum: $780,000 (§3.1) vs $779,364.14 (Exh. A/C)', 'open'],
      ['cmx_sublist', 'Get sub/supplier list with contract amounts (§11.3 / §12.3)', 'open', 'Was due before commencement'],
      ['cmx_registration', 'Get S-Bar Idaho Contractor Registration number (§2.4)', 'open', 'Only the SOS foreign registration (9/25) is on file'],
      ['cmx_coi_fix', 'COI corrections: per-project GL aggregate, owned/any auto', 'open'],
      ['cmx_rep_letter', 'Send written Project Representative designation (§8.2)', 'open'],
      ['cmx_restrictions', 'Recorded Restrictions notice to GC (§2.2)', 'open'],
      ['cmx_long_lead', 'Confirm long-lead items ordered (within 10 days of NTP)', 'open', null, '2026-10-08'],
      ['cmx_lender_consent', 'Lender contractor consent signed by S-Bar (§1.6)', 'open'],
      ['cmx_ins_renewals', 'S-Bar insurance renewals: GL/Umbrella 2/20/27, WC 2/25/27, Auto 7/25/27; completed-ops AI for 3 yrs after Final Completion', 'open', null, '2027-02-20'],
    ],
  },
  '6371 Nesbitt': {
    template: [
      ['cm_budget', 'done', 'TJK Design Build', '$907,220 not-to-exceed: $829,132 base + $78,088 alternates (Rider §1, Proposal 9/4). Tilsen shop roof $170,963 separate'],
      ['cm_contract', 'in_progress', 'TJK Design Build', 'No signed copy in the folder: Contract 9/4 and Rider (execution version) have blank signature blocks. Contract dates disagree (8/16, 9/4, 9/11)'],
      ['cm_start', 'done', null, 'Mobilized 9/14, started 9/15 (schedule 09.28)', '2026-09-15'],
      ['cm_est_completion', 'in_progress', null, 'Substantial Completion incl. punch 12/1 (Rider §4); schedule shows 12/2. No LDs', '2026-12-01'],
      ['cm_draw_structure', 'done', null, 'Pay app every 4 weeks. Pay within 10 days of the later of a complete pay app or the loan advance (Rider §3). 10% retainage to Substantial Completion'],
      ['cm_gc_insurance', 'open', 'TJK Design Build', 'Rider §5: owner, members, managers and lender as AI (primary/non-contributory), waiver of subrogation, 30-day cancellation notice, completed ops 2 yrs; subs same. Compliant COIs are a condition to NTP'],
      ['cm_permits', 'open', 'TJK Design Build', '$4,000 permit allowance + $5,500 drafting/engineering in TJK price; code items required by permit included (Rider §2)'],
      ['cm_lien_forms', 'open', null, 'Each pay app: sworn contractor statement + conditional waivers (current) and unconditional (prior) from TJK and every sub/supplier (Rider §3)'],
      ['cm_draw_setup', 'open', 'Sunwest', 'Loan up to $4.05M. Draw / inspection terms not in the folder (loan agreement missing)'],
      ['cm_ntp', 'done', null, 'Work started 9/15'],
      ['cm_weekly_report', 'open', 'TJK Design Build', 'Schedule 09.28: doors 10/12–10/23, ceilings 10/14–10/19, paint 10/20–10/27, flooring 10/28–11/4, baths/glass 11/5–11/12, MEP finish 11/13–11/20, punch 11/23–12/1'],
      ['cm_timing', 'open', null, 'Delay / concealed-condition notices must come within 5 business days (Rider §2, §4)'],
      ['cm_site_visit', 'open', null, 'Owner site visits on schedule: 10/30 and 11/25', '2026-10-30'],
      ['cm_payapp_checked', 'open', null, 'Updated SOV with % complete by line (Contract §2.7, Rider §3). Withholding needs written grounds'],
      ['cm_co_written', 'open', null, 'Written CO signed by both; cost + 15% (Supt $106, Carpenter $98, Laborer $82/hr). Owner answers within 5 business days — silence = rejection (Rider §1)'],
      ['cm_co_notify', 'open', 'Sunwest', 'Sunwest written consent required before ANY cost increase (Assignment §D(2))'],
      ['cm_sc_cert', 'open', null, 'Certificate of Substantial Completion satisfactory to lender (Rider §4)', '2026-12-01'],
      ['cm_punch', 'open', null, 'Punch 11/23–12/1 (schedule 09.28)', '2026-12-01'],
      ['cm_co_cert', 'open', null, 'Schedule says "Substantial Completion & Occupancy" 12/2; no CO obligation in contract'],
      ['cm_asbuilts', 'open', null, 'O&M manuals + assignment of all manufacturer and sub warranties at final completion (Rider §7). Tilsen 15-yr manufacturer warranty at its completion'],
      ['cm_final_waivers', 'open', null, 'From all tiers (Rider §3)'],
      ['cm_retainage', 'open', null, 'Within 30 days after punch complete AND final unconditional waivers (Rider §3) — ~12/31 if both land 12/1 (inferred)', '2026-12-31'],
      ['cm_builders_risk', 'open', null, "Owner carries builder's risk (Rider §5); Tilsen can also ask for it (§24)"],
      ['cm_warranty_walk', 'open', null, '12-month warranty from Substantial Completion (12/1/26 → 12/1/27)', '2027-11-01'],
    ],
    contract: [
      ['cmx_payapp1', 'TJK Pay App #1: SOV, sworn statement, conditional/unconditional waivers all tiers', 'open', 'Every 4 weeks from 9/14 start (inferred)', '2026-10-12'],
      ['cmx_payapp2', 'TJK Pay App #2', 'open', '(inferred date)', '2026-11-09'],
      ['cmx_payapp3', 'TJK Pay App #3', 'open', '(inferred date)', '2026-12-07'],
      ['cmx_tilsen', 'Sign Tilsen shop roof proposal ($170,963) — fix the address (it says 6317 Nesbitt, Fitchburg) first', 'open', 'Offer void 30 days after 9/28. Monthly progress payments by the 10th at 95%. Not on the TJK schedule — coordinate', '2026-10-28'],
      ['cmx_sign', 'Get fully signed TJK Contract + Rider; conform contract dates (8/16 vs 9/4 vs 9/11)', 'open'],
      ['cmx_sunwest_rider', 'Sunwest written consent to the Rider (Assignment §C(1) bars contract changes without it)', 'open'],
      ['cmx_assignment', 'Owner (Verona IOS) signature on the GC Assignment to Sunwest', 'open', 'Only TJK consent is signed in the scan'],
      ['cmx_sc_conflict', 'Resolve Substantial Completion date: Rider 12/1 vs schedule 12/2', 'open'],
      ['cmx_title', 'Give TJK title evidence', 'open'],
      ['cmx_sunwest_trc', 'Ask Sunwest whether the Tilsen roof contract must be assigned too', 'open'],
      ['cmx_permar', 'Per Mar cameras: $1,037/mo, 6-month minimum, 60-day cancellation notice — confirm install date', 'open', 'Owner provides poles, 120V power and alarm permits'],
      ['cmx_ribbon', 'Ribbon cutting', 'open', null, '2026-12-04'],
    ],
  },
};

// Same schema as lib/db.ts (dd_items with the list column), in case the app hasn't run the migration yet.
if (!dry) {
  const cols = (await db.execute('PRAGMA table_info(dd_items)')).rows.map(r => String(r.name));
  if (!cols.includes('list')) await db.execute("ALTER TABLE dd_items ADD COLUMN list TEXT NOT NULL DEFAULT 'dd'");
}

let ops = 0;
const exec = async (sql, args, desc) => {
  ops++;
  console.log(`${dry ? '[dry] ' : ''}${desc}`);
  if (!dry) await db.execute({ sql, args });
};

for (const [name, data] of Object.entries(PROJECTS)) {
  const deal = (await db.execute({ sql: 'SELECT id, stage FROM deals WHERE name = ?', args: [name] })).rows[0];
  if (!deal) { console.log(`skip ${name}: no such deal`); continue; }
  console.log(`\n== ${name} (#${deal.id}, ${deal.stage})`);

  const rows = (await db.execute({ sql: 'SELECT item_key, status, vendor, note, due_date FROM dd_items WHERE deal_id = ?', args: [deal.id] })).rows;
  const have = new Map(rows.map(r => [r.item_key, r]));

  const missing = CM_TEMPLATE.map((t, i) => ({ ...t, sort: (i + 1) * 10 })).filter(t => !have.has(t.key));
  if (missing.length) {
    ops++;
    console.log(`${dry ? '[dry] ' : ''}create ${missing.length} construction checklist lines from template`);
    if (!dry) await db.batch(missing.map(t => ({
      sql: "INSERT OR IGNORE INTO dd_items (deal_id, list, item_key, section, label, sort) VALUES (?, 'cm', ?, ?, ?, ?)",
      args: [deal.id, t.key, t.section, t.label, t.sort],
    })));
  }

  for (const [key, status, vendor = null, note = null, due = null] of data.template) {
    const row = have.get(key);
    if (row && (row.status !== 'open' || row.vendor || row.note || row.due_date)) { console.log(`keep ${key} (already edited)`); continue; }
    await exec(
      "UPDATE dd_items SET status = ?, vendor = ?, note = ?, due_date = ?, updated_at = datetime('now') WHERE deal_id = ? AND item_key = ?",
      [status, vendor, note, due, deal.id, key],
      `${key}: ${status}${due ? ` · due ${due}` : ''}${vendor ? ` · ${vendor}` : ''}`,
    );
  }

  let sort = 0;
  for (const [key, label, status, note = null, due = null] of data.contract) {
    sort++;
    if (have.has(key)) { console.log(`keep ${key} (exists)`); continue; }
    await exec(
      "INSERT INTO dd_items (deal_id, list, item_key, section, label, sort, status, note, due_date) VALUES (?, 'cm', ?, ?, ?, ?, ?, ?, ?)",
      [deal.id, key, CONTRACT_SECTION, label, sort, status, note, due],
      `+ ${CONTRACT_SECTION}: ${label.slice(0, 70)}${due ? ` · due ${due}` : ''}`,
    );
  }
}
console.log(`\n${ops} operation(s)${dry ? ' previewed — run without --dry-run to apply' : ' applied'}`);
