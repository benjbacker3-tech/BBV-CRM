export type CompKind = 'lease' | 'sale' | 'availability';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface Comp {
  id: number;
  kind: CompKind;
  market: string | null;
  status: string | null;
  comp_date: string | null;
  available_date: string | null;
  address: string;
  city: string | null;
  state: string | null;
  submarket: string | null;
  landlord: string | null;
  tenant: string | null;
  buyer: string | null;
  seller: string | null;
  property_type: string | null;
  sf: number | null;
  acres: number | null;
  rent_monthly: number | null;
  rent_plf: number | null;
  nnn_plf: number | null;
  price: number | null;
  alt_price: number | null;
  bumps: number | null;
  term_months: number | null;
  broker: string | null;
  zoning: string | null;
  yard: string | null;
  fence: string | null;
  lit: string | null;
  doors: number | null;
  depth: number | null;
  occupancy_note: string | null;
  marketing: string | null;
  notes: string | null;
  tom_months: number | null;
  review_status: ReviewStatus;
  source: string;
  source_ref: string | null;
  source_note: string | null;
  created_at: string;
  updated_at: string;
}

// Every editable column, in a stable order (used by the API for inserts/updates).
export const COMP_FIELDS = [
  'kind', 'market', 'status', 'comp_date', 'available_date', 'address', 'city', 'state', 'submarket',
  'landlord', 'tenant', 'buyer', 'seller', 'property_type', 'sf', 'acres', 'rent_monthly', 'rent_plf',
  'nnn_plf', 'price', 'alt_price', 'bumps', 'term_months', 'broker', 'zoning', 'yard', 'fence', 'lit',
  'doors', 'depth', 'occupancy_note', 'marketing', 'notes', 'tom_months', 'review_status', 'source',
  'source_ref', 'source_note',
] as const;
export type CompField = (typeof COMP_FIELDS)[number];

export const COMP_KINDS: { kind: CompKind; label: string }[] = [
  { kind: 'lease', label: 'Lease Comps' },
  { kind: 'sale', label: 'Sale Comps' },
  { kind: 'availability', label: 'Availabilities' },
];

// Workbook tab order. A comp's `market` is the tab it lives on.
export const MARKETS = ['Seattle', 'Denver', 'Phoenix', 'Salt Lake City', 'Las Vegas', 'SF', 'IE', 'LA', 'Terminals'];

export const MARKET_STATE: Record<string, string> = {
  Seattle: 'WA', Denver: 'CO', Phoenix: 'AZ', 'Salt Lake City': 'UT', 'Las Vegas': 'NV',
  SF: 'CA', IE: 'CA', LA: 'CA', Terminals: 'CO',
};

export const SQFT_PER_ACRE = 43560;

const pos = (n: number | null | undefined): n is number => n != null && isFinite(n) && n > 0;

export interface CompMetrics {
  landSF: number | null;
  coverage: number | null;   // building SF / land SF
  rentMonthly: number | null;
  rentLsfMo: number | null;  // $/land SF/month
  rentBsfYr: number | null;  // $/building SF/year
  rentAcreMo: number | null; // $/acre/month
  rentDoorMo: number | null;
  grossLsfMo: number | null; // rent + NNN, $/land SF/month
  priceLsf: number | null;   // sale $/land SF
  priceBsf: number | null;   // sale $/building SF
  tomMonths: number | null;  // time on market
}

const AVG_DAYS_PER_MONTH = 30.4375;

export function compMetrics(c: Pick<Comp, 'sf' | 'acres' | 'rent_monthly' | 'rent_plf' | 'nnn_plf' | 'price' | 'doors' | 'available_date' | 'tom_months'>, today = new Date()): CompMetrics {
  const landSF = pos(c.acres) ? c.acres * SQFT_PER_ACRE : null;
  const rentMonthly = pos(c.rent_monthly) ? c.rent_monthly : pos(c.rent_plf) && landSF ? c.rent_plf * landSF : null;
  const rentLsfMo = rentMonthly && landSF ? rentMonthly / landSF : pos(c.rent_plf) ? c.rent_plf : null;
  let tomMonths: number | null = c.tom_months ?? null;
  if (c.available_date) {
    const t = Date.parse(c.available_date);
    if (!isNaN(t)) tomMonths = Math.max(0, (today.getTime() - t) / 86_400_000 / AVG_DAYS_PER_MONTH);
  }
  return {
    landSF,
    coverage: pos(c.sf) && landSF ? c.sf / landSF : null,
    rentMonthly,
    rentLsfMo,
    rentBsfYr: rentMonthly && pos(c.sf) ? (rentMonthly * 12) / c.sf : null,
    rentAcreMo: rentMonthly && pos(c.acres) ? rentMonthly / c.acres : null,
    rentDoorMo: rentMonthly && pos(c.doors) ? rentMonthly / c.doors : null,
    grossLsfMo: rentLsfMo != null && pos(c.nnn_plf) ? rentLsfMo + c.nnn_plf : null,
    priceLsf: pos(c.price) && landSF ? c.price / landSF : null,
    priceBsf: pos(c.price) && pos(c.sf) ? c.price / c.sf : null,
    tomMonths,
  };
}

// ── Export layouts ──────────────────────────────────────────────────────────
// Mirrors West Region Tracking - BB.xlsx: each tab's sections, titles and column
// headers. Column `key`s are stored fields or derived metrics (see exportValue).

export type ColKey =
  | 'no' | 'date' | 'status' | 'address' | 'city' | 'submarket' | 'landlord' | 'tenant' | 'buyer' | 'seller'
  | 'sf' | 'acres' | 'cvg' | 'type' | 'marketing' | 'rent' | 'price' | 'lsf_mo' | 'bsf_yr' | 'acre_mo'
  | 'door_mo' | 'sale_plf' | 'nnn' | 'gross' | 'bumps' | 'term' | 'occupancy' | 'alt_price' | 'broker'
  | 'details' | 'zoning' | 'yard' | 'fence' | 'lit' | 'doors' | 'depth' | 'avail_date' | 'tom';

export interface LayoutCol { label: string; key: ColKey }
export interface LayoutSection { kind: CompKind; title: string; band?: string; cols: LayoutCol[] }

const c = (label: string, key: ColKey): LayoutCol => ({ label, key });

const BASE_LEASE = [c('Date', 'date'), c('Address', 'address'), c('City', 'city'), c('Landlord', 'landlord'), c('Tenant', 'tenant'), c('SF', 'sf'), c('Acres', 'acres'), c('Cvg %', 'cvg')];
const BASE_AVAIL = [c('Status', 'status'), c('Address', 'address'), c('City', 'city'), c('Landlord', 'landlord'), c('Tenant', 'tenant'), c('SF', 'sf'), c('Acres', 'acres'), c('Cvg %', 'cvg')];
const BASE_SALE = [c('Date', 'date'), c('Address', 'address'), c('City', 'city'), c('Buyer', 'buyer'), c('Seller', 'seller'), c('SF', 'sf'), c('Acres', 'acres'), c('Cvg %', 'cvg')];

// Phoenix / Salt Lake City / Las Vegas share one layout; it's also the default for new markets.
const STANDARD: LayoutSection[] = [
  { kind: 'lease', title: 'Lease Comps', band: 'Comp', cols: [...BASE_LEASE, c('Type', 'type'), c('$s', 'rent'), c('$ PSF', 'bsf_yr'), c('$ Acre', 'acre_mo'), c('Bumps', 'bumps'), c('Term (mos)', 'term'), c('Details', 'details')] },
  { kind: 'availability', title: 'Availabilities', band: 'Ask', cols: [...BASE_AVAIL, c('Type', 'type'), c('$s', 'rent'), c('$ PSF', 'bsf_yr'), c('$ Acre', 'acre_mo'), c('Available Date', 'avail_date'), c('Time on Market', 'tom'), c('Details', 'details')] },
  { kind: 'sale', title: 'Sale Comps', band: 'Comp', cols: [...BASE_SALE, c('Type', 'type'), c('$s', 'price'), c('$ PLF', 'sale_plf'), c('Term', 'occupancy'), c('Type', 'marketing'), c('IOV Price', 'alt_price'), c('Details', 'details')] },
];

export const DEFAULT_LAYOUT = STANDARD;

const IE_COLS = [...BASE_LEASE, c('Yard', 'yard'), c('Fence', 'fence'), c('Lit', 'lit'), c('Type', 'type'), c('$ PLF', 'lsf_mo'), c('NNN', 'nnn'), c('Bumps', 'bumps'), c('Term (mos)', 'term')];
const LA_COLS = [c('Address', 'address'), c('City', 'city'), c('Submarket', 'submarket'), c('BSF', 'sf'), c('Acres', 'acres'), c('Zoning', 'zoning'), c('Cvg', 'cvg'), c('Type', 'type'), c('$PLF', 'lsf_mo'), c('NNN', 'nnn'), c('Gross', 'gross'), c('Broker', 'broker'), c('Landlord', 'landlord')];
const SF_COLS = [...BASE_LEASE, c('Type', 'type'), c('$s', 'rent'), c('$ PLF', 'lsf_mo'), c('Bumps', 'bumps'), c('Term (mos)', 'term')];

export const MARKET_LAYOUTS: Record<string, LayoutSection[]> = {
  Seattle: [
    { kind: 'lease', title: 'Lease Comps', band: 'Comp', cols: [...BASE_LEASE, c('$s', 'rent'), c('$ PSF', 'lsf_mo'), c('Bumps', 'bumps')] },
    { kind: 'sale', title: 'Sale Comps', band: 'Comp', cols: [...BASE_SALE, c('$s', 'price'), c('$ PLF', 'sale_plf'), c('Term', 'occupancy')] },
  ],
  Denver: [
    { kind: 'lease', title: 'Lease Comps', band: 'Comp', cols: [...BASE_LEASE, c('$s', 'rent'), c('$ PSF', 'bsf_yr'), c('$ Acre', 'acre_mo'), c('Bumps', 'bumps'), c('Term (mos)', 'term'), c('Broker', 'broker')] },
    { kind: 'availability', title: 'Availabilities', band: 'Ask', cols: [...BASE_AVAIL, c('$s', 'rent'), c('$ PSF', 'bsf_yr'), c('$ Acre', 'acre_mo'), c('Available Date', 'avail_date'), c('Time on Market', 'tom'), c('Broker', 'broker')] },
    { kind: 'sale', title: 'Sale Comps', band: 'Comp', cols: [...BASE_SALE, c('$s', 'price'), c('$ PLF', 'sale_plf'), c('Term', 'occupancy'), c('Type', 'marketing'), c('IOV Price', 'alt_price'), c('Broker', 'broker')] },
  ],
  Phoenix: STANDARD,
  'Salt Lake City': STANDARD,
  'Las Vegas': STANDARD,
  SF: [
    { kind: 'lease', title: 'COMPS', band: 'Comp', cols: SF_COLS },
    { kind: 'availability', title: 'AVAILABILITIES', band: 'Ask', cols: SF_COLS.map(col => (col.key === 'date' ? c('Available Date', 'avail_date') : col)) },
  ],
  IE: [
    { kind: 'lease', title: 'Comps', band: 'Comp', cols: IE_COLS },
    { kind: 'availability', title: 'Availabilities', band: 'Ask', cols: IE_COLS.map(col => (col.key === 'date' ? c('Status', 'status') : col)) },
  ],
  LA: [
    { kind: 'availability', title: 'Orange County: Availabilities', band: 'Asking Rent', cols: [c('No.', 'no'), ...LA_COLS] },
    { kind: 'lease', title: 'Orange County: Comps', band: 'Comp', cols: [c('Date', 'date'), ...LA_COLS] },
  ],
  Terminals: [
    { kind: 'lease', title: 'COMPS', band: 'Comp', cols: [...BASE_LEASE, c('Doors', 'doors'), c('Depth', 'depth'), c('Type', 'type'), c('$s', 'rent'), c('$ PSF', 'bsf_yr'), c('$ Acre', 'acre_mo'), c('$ Door', 'door_mo'), c('Bumps', 'bumps'), c('Term (mos)', 'term')] },
  ],
};

export function layoutFor(market: string): LayoutSection[] {
  return MARKET_LAYOUTS[market] || DEFAULT_LAYOUT;
}
