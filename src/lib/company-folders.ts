// Company-level (non-deal) filing for email attachments. Folders are relative to the
// Sandpiper root and follow what's already in OneDrive (Formation, Investor Update,
// Market Info, Accounting, Company Level Contracts), plus a few added for what shows
// up in the inbox (Capital Markets, Templates, Branding).
//
// Pure functions (no server imports) so the inbox page can list the same folders.

export const COMPANY_FOLDERS = [
  'Formation/Sandpiper Capital LLC',
  'Formation/CentrePoint Properties',
  'Formation/Note from Aasif',
  'Company Level Contracts',
  'Company Level Contracts/NDAs',
  'Accounting',
  'Accounting/Banking',
  'Investor Update',
  'Investor Update/Pipeline Tracking',
  'Investor Update/Tour Decks',
  'Capital Markets',
  'Insurance',
  'Market Info/Reports',
  'Market Info/Comps',
  'Market Info/Offerings',
  'Templates',
  'Branding',
];

// Decided by the file name alone. These win over a deal that is only mentioned in the
// email text (a pipeline deck sent with a note about 106th still goes to Investor Update).
const STRONG: [RegExp, string][] = [
  [/acq(uisition)? pipeline/, 'Investor Update/Pipeline Tracking'],
  [/sandpiper update|track record|deal sheet|investor update|aasif pipeline/, 'Investor Update'],
  [/\btour\b/, 'Investor Update/Tour Decks'],
  [/bfo investments|revolving demand note/, 'Formation/Note from Aasif'],
  [/\bfund i\b.*\b(fs|financials?|report|statements?)\b|fund financial/, 'Formation/CentrePoint Properties'],
  [/signature card|client (information|profile)|deposit account|fee ?schedule|beneficial own|\bcobo\b/, 'Accounting/Banking'],
  [/engagement letter|service agreement|statement of work|\bsow\b|master services/, 'Company Level Contracts'],
  [/template|lease form|checklist/, 'Templates'],
  [/\blogo\b|\bbrand(ing)?\b|discovery phase/, 'Branding'],
  [/market (flash|report|update|insights?|outlook)|executive summary|research report/, 'Market Info/Reports'],
];

// Sandpiper Capital LLC's own entity documents.
const OWN_ENTITY = /operating agreement|llc agreement|resolution|\bein\b|state notice|articles of|certificate of (formation|good standing)|good standing|wire instructions|w-?9/;

// Only when no deal is involved.
const WEAK_NAME: [RegExp, string][] = [
  [/centrepoint|centerpoint|\bcpp\b/, 'Formation/CentrePoint Properties'],
  [/\bnda\b|\bca[ _-]?fa|confidentiality|non-?disclosure/, 'Company Level Contracts/NDAs'],
  [/\bsov\b|statement of values|insurance|\bcoi\b|certificate of insurance/, 'Insurance'],
  [/quote matrix|term sheet|financing submission|\bpfs\b|\breo template/, 'Capital Markets'],
  [/invoice|receipt|\binv[-_ ]?\d|expenses?\b|payment/, 'Accounting'],
  [/comps?\b|rent formula|market rent|rent survey|west region/, 'Market Info/Comps'],
  [/\bom\b|offering ?memo|brochure|flyer|teaser|off[- ]market|for sale|investment opportunity/, 'Market Info/Offerings'],
];

const WEAK_SUBJECT: [RegExp, string][] = [
  [/signature card|new account|account opening/, 'Accounting/Banking'],
  [/invoice|receipt|billing/, 'Accounting'],
  [/engagement letter|accounting (&|and) tax|tax services/, 'Company Level Contracts'],
  [/\bnda\b|\bca[ _-]?fa|confidentiality/, 'Company Level Contracts/NDAs'],
  [/insurance/, 'Insurance'],
  [/tour (book|deck)/, 'Investor Update/Tour Decks'],
  [/quote matri|term sheets?\b|capital markets/, 'Capital Markets'],
  [/market (insights?|report|update|flash)|\bq[1-4]\b.*(ios|industrial)|research/, 'Market Info/Reports'],
  [/off[- ]market|for sale|\bom\b|sale[- ]?leaseback|\bslb\b|leased investment|investment opportunity|\bios (deal|portfolio|in)\b|cap rate|hit the market|new listing/, 'Market Info/Offerings'],
];

// Event invitations and flyers aren't filed.
const EVENT = /\bevents?\b|clay shoot|golf|happy hour|webinar|summit|conference|\bgala\b|tournament|invitation/;

const isDocument = (n: string) => /\.(pdf|docx?|xlsx?|xlsm|pptx?|csv|zip)$/.test(n);

// Never filed anywhere: mail-system reports, calendar links, event flyers.
export function companyNoise(name: string, sender: string | null): string | null {
  const n = name.toLowerCase();
  const s = (sender || '').toLowerCase();
  if (/dmarc|microsoftexchange|postmaster/.test(s) || /\.xml(\.gz)?$|\.url$|batchreport\.csv$/.test(n)) return 'Mail system report or link';
  return null;
}

export function strongCompanyFolder(name: string): string | null {
  const n = name.toLowerCase();
  if (/sandpiper capital|\bsandpiper (ein|llc)\b|^sandpiper ein/.test(n) && OWN_ENTITY.test(n)) return 'Formation/Sandpiper Capital LLC';
  return STRONG.find(([re]) => re.test(n))?.[1] ?? null;
}

export function weakCompanyFolder(name: string, subject: string | null): string | null {
  const n = name.toLowerCase();
  if (!isDocument(n)) return null; // screenshots and photos without a deal aren't worth filing
  if (EVENT.test((subject || '').toLowerCase()) || /flyer-agenda|check-?in ?form/.test(n)) return null;
  const byName = WEAK_NAME.find(([re]) => re.test(n))?.[1];
  if (byName) return byName;
  const s = (subject || '').toLowerCase();
  return WEAK_SUBJECT.find(([re]) => re.test(s))?.[1] ?? null;
}

// A broker PDF named for a property that isn't a CRM deal ("4224 W Indian School Rd.pdf",
// "1400_E_66th_Ave_Equity_Deck.pdf"): an offering to keep for reference.
export function offeringByAddress(name: string, subject: string | null): string | null {
  const n = name.toLowerCase().replace(/_/g, ' ');
  if (!/\.pdf$/.test(n) || EVENT.test((subject || '').toLowerCase())) return null;
  return /^\s*\d{2,6}(-\d+)? (?:[nsew]\.? )?[a-z0-9]+/.test(n) ? 'Market Info/Offerings' : null;
}
