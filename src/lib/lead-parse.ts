// Broker-lead detection and parsing (pure; used by lib/leads.ts and testable on its own).
// A lead is an email offering a property: a broker blast ("Off-Market IOS Opportunity in
// Brighton, CO") or a broker's note with an OM / brochure / flyer attached ("6550 Interstate
// Blvd"). The parser pulls what it can; Ben confirms or fixes it before anything is created.

export interface ParsedLead {
  address: string | null;
  city: string | null;
  state: string | null;
  price: number | null;
  acres: number | null;
  sf: number | null;
  cap_rate: number | null;   // percent, e.g. 7.75
}

// Offering words in a subject (same family the email filing uses to skip broker listings).
export const OFFERING_SUBJECT = /off[- ]market|pre[- ]market|for sale|for (sub)?lease|available for|now available|just listed|new listing|hit the market|cap rate|\bom\b|opportunity|offering|investment sale|sale[- ]?leaseback|\bslb\b|\bnnn\b|\bios\b|outdoor storage|truck (yard|terminal|parking)|land for sale|value[- ]add/i;
// Attachment names that are marketing material for a property.
// Also a file named with the site's size ("3788 Wheeling Street - 16,524sf - 2.14ac.pdf").
export const OM_FILE = /\bom\b|offering|memorandum|brochure|flyer|teaser|investment summary|for sale|sale brochure|deal summary|\bpackage\b|\d(?:\.\d+)?\s?ac\b|\d[\d,]*\s?sf\b/i;
// Clearly not a lead even if a word above matches.
const NOT_LEAD = /\b(loi|letter of intent|psa|purchase (and|&) sale|invoice|receipt|statement|webinar|newsletter|unsubscribe confirmation|out of office|automatic reply)\b/i;

export function isLead(subject: string, attachmentNames: string[]): { lead: boolean; why: string } {
  const s = subject.replace(/^((re|fw|fwd):\s*)+/i, '');
  if (NOT_LEAD.test(s)) return { lead: false, why: 'not an offering' };
  const om = attachmentNames.find(n => OM_FILE.test(n) && /\.(pdf|pptx?|docx?)$/i.test(n));
  if (om) return { lead: true, why: `attachment "${om}"` };
  if (OFFERING_SUBJECT.test(s)) return { lead: true, why: 'subject' };
  return { lead: false, why: '' };
}

const STATES = 'AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY';
const SUFFIX = 'St|Street|Ave|Avenue|Blvd|Boulevard|Rd|Road|Dr|Drive|Way|Pkwy|Parkway|Ln|Lane|Ct|Court|Hwy|Highway|Pl|Place|Cir|Circle|Trl|Trail|Pike|Loop|Sq|Terrace|Ter';
const ADDRESS = new RegExp(`\\b(\\d{2,6}(?:-\\d{2,6})?\\s+(?:[NSEW]\\.?\\s+)?(?:[A-Za-z0-9][\\w.']*\\s+){0,3}?(?:${SUFFIX})\\b\\.?(?:\\s+[NSEW]{1,2}\\b)?)`, 'i');
// "6550 Interstate", "3788 Wheeling", "9090 Brighton Road" at the start of a subject.
const LEADING_ADDRESS = /^(\d{3,6}(?:-\d{2,6})?\s+(?:[NSEW]\.?\s+)?[A-Z][\w.']*(?:\s+(?!for\b|sale\b|ios\b|deal\b|opportunity\b)[A-Z][\w.']*)?)\b/;
// "9090 Brighton" anywhere in a subject: a number and a capitalized street name, not a size.
const NUMBERED_NAME = /\b(\d{3,6}\s+(?:[NSEW]\.?\s+)?(?!OM\b|SF\b|AC\b|IOS\b)[A-Z][a-z][\w.']*(?:\s+(?!OM\b|For\b|Sale\b|IOS\b|Deal\b)[A-Z][a-z][\w.']*)?)\b(?!\s*(?:sf|ac|acres?|%))/;
const CITY_ST =new RegExp(`(?:^|[\\s,–|(-])([A-Z][a-zA-Z.']+(?:\\s[A-Z][a-zA-Z.']+){0,2}),?\\s+(${STATES})\\b`);

const num = (s: string) => Number(s.replace(/,/g, ''));
const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/[.,]$/, '').trim();

export function parseLead(subject: string, body: string, attachmentNames: string[], knownCities: string[] = []): ParsedLead {
  const subj = subject.replace(/^((re|fw|fwd):\s*)+/i, '').replace(/[[\]]/g, ' ');
  const names = attachmentNames.map(n => n.replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' '));
  const all = [subj, ...names, body].join('\n');

  // Address: subject first, then attachment names, then the body.
  let address: string | null = null;
  for (const src of [subj, ...names, body]) {
    const m = src.match(ADDRESS);
    if (m) { address = tidy(m[1]); break; }
  }
  if (!address) { const m = subj.trim().match(LEADING_ADDRESS) ?? subj.match(NUMBERED_NAME); if (m) address = tidy(m[1]); }

  // City and state: "Brighton, CO", "in Commerce City, CO", "Fife, WA"; else a known city name.
  let city: string | null = null, state: string | null = null;
  for (const src of [subj, ...names, body]) {
    const m = src.match(CITY_ST);
    if (m && !/^(IOS|NNN|SF|AC|LLC|Inc|The|For|Sale|Lease)$/i.test(m[1])) {
      city = tidy(m[1].replace(/^(in|at|near)\s+/i, ''));
      state = m[2].toUpperCase();
      break;
    }
  }
  if (!city) {
    const lower = all.toLowerCase();
    const hit = knownCities.filter(c => c.length > 3).sort((a, b) => b.length - a.length).find(c => new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower));
    if (hit) city = hit.replace(/\b\w/g, ch => ch.toUpperCase());
  }

  // Price: "$8.5 MM", "$4.2M", "$3,600,000"; prefer one near "price/asking/offered".
  let price: number | null = null;
  const priceRe = /\$\s?(\d+(?:\.\d+)?)\s?(mm|m|million)\b|\$\s?(\d{1,3}(?:,\d{3}){2,})/gi;
  const prices: { v: number; i: number }[] = [];
  for (const m of Array.from(all.matchAll(priceRe))) {
    const v = m[1] ? Number(m[1]) * 1_000_000 : num(m[3]);
    if (v >= 250_000 && v <= 500_000_000) prices.push({ v, i: m.index ?? 0 });
  }
  if (prices.length) {
    const near = prices.find(p => /(price|asking|offered at|list|purchase)[^$]{0,30}$/i.test(all.slice(Math.max(0, p.i - 40), p.i)));
    price = (near ?? prices[0]).v;
  }

  const acresM = all.match(/(\d+(?:\.\d+)?)\s?-?\s?(?:acres?|ac)\b/i);
  const acres = acresM ? Number(acresM[1]) : null;
  const sfM = all.match(/(\d{1,3}(?:,\d{3})+|\d{4,7})\s?(?:sf|sq\.?\s?ft\.?|square feet)\b/i);
  const sf = sfM ? num(sfM[1]) : null;
  const capM = all.match(/(\d{1,2}(?:\.\d{1,2})?)\s?%\s?cap\b|cap(?:\s?rate)?\s?(?:of|:|at)?\s?(\d{1,2}(?:\.\d{1,2})?)\s?%/i);
  const cap_rate = capM ? Number(capM[1] ?? capM[2]) : null;

  return {
    address, city, state,
    price,
    acres: acres != null && acres > 0 && acres < 2000 ? acres : null,
    sf: sf != null && sf >= 500 && sf < 5_000_000 ? sf : null,
    cap_rate: cap_rate != null && cap_rate > 2 && cap_rate < 20 ? cap_rate : null,
  };
}

// "Michael Kraus <michael@malmancre.com>" → firm from the domain, for the lead card.
const FIRMS: Record<string, string> = {
  'cbre.com': 'CBRE', 'jll.com': 'JLL', 'am.jll.com': 'JLL', 'cushwake.com': 'Cushman & Wakefield', 'colliers.com': 'Colliers',
  'nmrk.com': 'Newmark', 'newmark.com': 'Newmark', 'marcusmillichap.com': 'Marcus & Millichap', 'kidder.com': 'Kidder Mathews',
  'leeassociates.com': 'Lee & Associates', 'naicapital.com': 'NAI Capital', 'avisonyoung.com': 'Avison Young', 'svn.com': 'SVN',
  'cresa.com': 'Cresa', 'transwestern.com': 'Transwestern', 'lee-associates.com': 'Lee & Associates', 'voitco.com': 'Voit',
};
export function firmOf(email: string | null | undefined): string | null {
  const domain = (email || '').toLowerCase().split('@')[1];
  if (!domain || /gmail|yahoo|outlook|hotmail|icloud|aol/.test(domain)) return null;
  if (FIRMS[domain]) return FIRMS[domain];
  const root = domain.split('.').slice(-2, -1)[0] || domain;
  return root.length <= 4 ? root.toUpperCase() : root.charAt(0).toUpperCase() + root.slice(1);
}
