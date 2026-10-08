import { COMP_FIELDS, CompField } from './comps';

const NUMERIC = new Set<CompField>([
  'sf', 'acres', 'rent_monthly', 'rent_plf', 'nnn_plf', 'price', 'alt_price', 'bumps', 'term_months', 'doors', 'depth', 'tom_months',
]);

// Keep only known columns; coerce numerics; blank strings become null.
export function cleanCompInput(body: Record<string, unknown>): Partial<Record<CompField, string | number | null>> {
  const out: Partial<Record<CompField, string | number | null>> = {};
  for (const k of COMP_FIELDS) {
    if (!(k in body)) continue;
    const v = body[k];
    if (v == null || (typeof v === 'string' && v.trim() === '')) { out[k] = null; continue; }
    if (NUMERIC.has(k)) {
      const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[$,%\s]/g, ''));
      out[k] = isFinite(n) ? n : null;
    } else {
      out[k] = String(v).trim();
    }
  }
  return out;
}
