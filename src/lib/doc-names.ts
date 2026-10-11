// Standard file names for documents saved to a deal folder:
//   "[what the document is] - [property address]"   e.g. "Executed PSA 07.14.26 - 10275 E 106th.pdf"
// The address is the deal's street address only (no city or state). The document part
// is a known type when the file name says one ("Term Sheet", "Phase I ESA"), with a
// status in front (Executed / Redline / Draft / Form) and the document's date after it,
// so versions don't collide. When no known type matches, the original name is kept with
// the property, city, state and version noise taken out.

import type { Deal } from './utils';

const ORDINAL = '(first|second|third|fourth|fifth|sixth|1st|2nd|3rd|4th|5th|6th)';

// Most specific first: the first match names the document.
const TYPES: [RegExp, string][] = [
  [/\bloi\b|letter of intent/, 'LOI'],
  [/\b(psa|contract)\b.*\b(amend|addend)|\b(amend|addend).*\b(psa|purchase|contract to buy)/, 'PSA Amendment'],
  [/\bpsa\b|purchase (and|&) sale|purchase agreement|contract to buy/, 'PSA'],
  [/commission agreement/, 'Commission Agreement'],
  [/listing agreement/, 'Listing Agreement'],
  [/lease assignment|assignment (and assumption )?of lease/, 'Lease Assignment'],
  [/lease extension|extension.*\blease\b/, 'Lease Extension'],
  [/lease amend|amend.*\blease\b/, 'Lease Amendment'],
  [/summary of lease|lease (summary|abstract)/, 'Lease Summary'],
  [/side agreement/, 'Lease Side Agreement'],
  [/estoppel.*snda|snda.*estoppel/, 'Estoppel & SNDA'],
  [/estoppel/, 'Estoppel'],
  [/\bsnda\b|subordination/, 'SNDA'],
  [/\bpma\b|property management|management agreement/, 'PMA'],
  [/rent roll/, 'Rent Roll'],
  [/\bcoi\b|cert(ificate)? of insurance/, 'COI'],
  [/\bsov\b|statement of values/, 'SOV'],
  [/loss runs/, 'Loss Runs'],
  [/phase (ii|2)\b/, 'Phase II ESA'],
  [/phase (i|1)\b|\besa\b/, 'Phase I ESA'],
  [/\bpca\b|property condition/, 'PCA'],
  [/title commitment|alta commitment|schedule b/, 'Title Commitment'],
  [/title objection/, 'Title Objection Letter'],
  [/\balta\b/, 'ALTA Survey'],
  [/\bsurvey\b/, 'Survey'],
  [/\bzar\b|\bpzr\b|zoning/, 'Zoning Report'],
  [/geotech|soils/, 'Geotech Report'],
  [/roof inspection/, 'Roof Inspection'],
  [/appraisal/, 'Appraisal'],
  [/seller'?s?'? (property )?disclosure/, "Seller's Disclosure"],
  [/\bnda\b|confidentiality/, 'NDA'],
  [/hold harmless|access agreement/, 'Access Agreement'],
  [/operating agreement|\boa\b/, 'Operating Agreement'],
  [/articles of (organization|incorporation)/, 'Articles of Organization'],
  [/\bein\b|\bss-?4\b/, 'EIN Letter'],
  [/org(anizational)? chart/, 'Org Chart'],
  [/term sheet/, 'Term Sheet'],
  [/loan agreement/, 'Loan Agreement'],
  [/promissory note/, 'Promissory Note'],
  [/deed of trust/, 'Deed of Trust'],
  [/needs list/, 'Lender Needs List'],
  [/settlement statement|closing statement|buyers? (statement|stmt)|sellers? (statement|stmt)/, 'Settlement Statement'],
  [/wire instructions/, 'Wire Instructions'],
  [/payment instructions/, 'Payment Instructions'],
  [/\bdeed\b/, 'Deed'],
  [/lien waiver/, 'Lien Waiver'],
  [/pay app|draw request/, 'Pay App'],
  [/change order/, 'Change Order'],
  [/\bw-?9\b/, 'W-9'],
  [/\binvoice|\binv ?\d/, 'Invoice'],
  [/\bbids?\b/, 'Bid'],
  [/tax (bill|statement)/, 'Tax Bill'],
  [/operating statements?/, 'Operating Statements'],
  [/offering memo|\bom\b/, 'OM'],
  [/brochure|flyer/, 'Flyer'],
  [/site plan/, 'Site Plan'],
  [/floor plan/, 'Floor Plan'],
  [/pre[- ]?app(lication)?/, 'Pre-Application'],
  [/\blease\b/, 'Lease'],
];

// Status words worth keeping in front of the type: "Executed PSA", "Redline PSA".
const QUALIFIERS: [RegExp, string][] = [
  [/\b(fully )?executed\b|\bsigned\b|countersigned|\(fe\b|\bfe \d/, 'Executed'],
  [/redline|blackline|\bcompare\b/, 'Redline'],
  [/\bdraft\b/, 'Draft'],
  [/\(form\)|\bform\b(?! \w)/, 'Form'],
];

const SUFFIX = '(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|ln|lane|ct|court|pl|place|pkwy|parkway|hwy|highway)';
const DIR = '(?:[nsew]|north|south|east|west)';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const two = (n: number) => String(n).padStart(2, '0');

// "10275 E 106th Ave, Brighton, CO" → "10275 E 106th Ave".
export const streetAddress = (d: Pick<Deal, 'address' | 'name'>) => (d.address || d.name).split(',')[0].trim();

// The document's date as MM.DD.YY: "07 14 26", "9.23.2026", "2026-09-23", "20260825".
function dateIn(s: string): string | null {
  let m = s.match(/\b(20\d{2})[.\-_ ]?(\d{2})[.\-_ ]?(\d{2})(?!\d)/);
  if (m && +m[2] >= 1 && +m[2] <= 12 && +m[3] >= 1 && +m[3] <= 31) return `${m[2]}.${m[3]}.${m[1].slice(2)}`;
  m = s.match(/(?<![\d.])(\d{1,2})[.\-/ ](\d{1,2})[.\-/ ](20\d{2}|\d{2})(?![\d.])/);
  if (m && +m[1] >= 1 && +m[1] <= 12 && +m[2] >= 1 && +m[2] <= 31) return `${two(+m[1])}.${two(+m[2])}.${m[3].slice(-2)}`;
  return null;
}

// The property's own street ("1962 Ives WA", "10275 East 106th Avenue", "Brighton IOS") out of a name.
function withoutProperty(t: string, deal: Pick<Deal, 'address' | 'name' | 'city' | 'state'>): string {
  const addr = streetAddress(deal);
  const street = addr.replace(/^\d+\s*/, '').replace(new RegExp(`^${DIR}\\.?\\s+`, 'i'), '').replace(new RegExp(`\\s+${SUFFIX}\\.?$`, 'i'), '');
  if (street) t = t.replace(new RegExp(`(\\b\\d{2,6}(?:-\\d+)?\\s+)?(${DIR}\\.?\\s+)?\\b${esc(street)}\\b(\\s+${SUFFIX}\\b\\.?)?`, 'gi'), ' ');
  if (deal.city) t = t.replace(new RegExp(`\\b${esc(deal.city)}\\b(\\s+IOS\\b)?`, 'gi'), ' ');
  if (deal.state) t = t.replace(new RegExp(`\\b${esc(deal.state)}\\b`, 'g'), ' ');
  return t;
}

export function docTypeOf(fileName: string, deal: Pick<Deal, 'address' | 'name' | 'city' | 'state'>): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/_+/g, ' ');
  const n = base.toLowerCase();
  const date = dateIn(base);
  let type = TYPES.find(([re]) => re.test(n))?.[1];
  if (type) {
    const ord = n.match(new RegExp(`\\b${ORDINAL}\\b`))?.[1];
    if (ord && /Amendment$/.test(type)) type = `${ord[0].toUpperCase()}${ord.slice(1)} ${type}`.replace(/^(\d)(st|nd|rd|th)/i, (_m, d, s) => d + s.toLowerCase());
    if (/proposal/.test(n)) type = `${type} Proposal`;
    const q = QUALIFIERS.find(([re]) => re.test(n))?.[1];
    return [q, type, date].filter(Boolean).join(' ');
  }
  if (/proposal/.test(n)) return ['Proposal', date].filter(Boolean).join(' ');
  return plainDocName(fileName, deal);
}

// The original name minus the property and version noise. Used when no known type
// matches, and to tell apart files that would otherwise get the same name.
export function plainDocName(fileName: string, deal: Pick<Deal, 'address' | 'name' | 'city' | 'state'>): string {
  const base = fileName.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/_+/g, ' ');
  const t = withoutProperty(base, deal)
    .replace(/\b\d{5}(-\d{4})?\b/g, ' ') // zip
    .replace(/\b(v\d+|final|clean|copy)\b|\(\d+\)|`/gi, ' ')
    .replace(/\(\s*\)/g, ' ')
    .replace(/\s*[-–,]\s*(?=[-–,]|$)|^\s*[-–,]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return t || 'Document';
}

export function standardFileName(fileName: string, deal: Pick<Deal, 'address' | 'name' | 'city' | 'state'>): string {
  const ext = fileName.match(/\.[a-z0-9]{1,5}$/i)?.[0] ?? '';
  return `${docTypeOf(fileName, deal)} - ${streetAddress(deal)}${ext.toLowerCase()}`.replace(/[\\/:*?"<>|]/g, '-');
}
