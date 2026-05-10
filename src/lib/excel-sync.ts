// Shared definitions for the per-deal model sync tab.
// Both /api/properties/template (generator) and /api/properties/import (parser)
// import from this module so the field list stays in sync.

export const SYNC_TAB_NAME = 'MCI Pipeline';

export type SyncKind = 'text' | 'int' | 'money' | 'acres' | 'pct' | 'days' | 'stage' | 'date';

export interface SyncField {
  /** Label shown in column A of the template */
  field: string;
  /** Database column to write to */
  col: string;
  kind: SyncKind;
  note?: string;
}

export const SYNC_FIELDS: SyncField[] = [
  // Property
  { field: 'Address', col: 'address', kind: 'text', note: 'Required. Used as the unique key for upsert.' },
  { field: 'Deal Name', col: 'name', kind: 'text', note: 'Optional. Defaults to Address if blank.' },
  { field: 'City', col: 'city', kind: 'text' },
  { field: 'Market', col: 'market', kind: 'text', note: 'e.g. Detroit, Denver, Wisconsin' },
  { field: 'Submarket', col: 'submarket', kind: 'text' },
  { field: 'Zoning', col: 'zoning', kind: 'text' },
  { field: 'Source', col: 'source', kind: 'text', note: 'Broker, off-market, listing, etc.' },
  { field: 'Stage', col: 'stage', kind: 'stage', note: 'Tracking | LOI Submitted | Negotiating PSA | Under Contract | Closed | Dead' },

  // Specs
  { field: 'Building SF', col: 'sf', kind: 'int' },
  { field: 'Acres', col: 'acreage', kind: 'acres' },
  { field: 'Occupancy', col: 'occupancy', kind: 'pct', note: 'Enter as % (e.g. 100 = fully leased)' },

  // Basis & Returns
  { field: 'Asking Price', col: 'asking_price', kind: 'money' },
  { field: 'Initial YoC', col: 'yoc_initial', kind: 'pct', note: 'In-place yield. Enter as % (e.g. 6.5)' },
  { field: 'Stab YoC', col: 'yoc_target', kind: 'pct', note: 'Stabilized target. Enter as % (e.g. 10.5)' },
  { field: 'Equity Required', col: 'equity_required', kind: 'money' },

  // Transaction
  { field: 'DD Period (days)', col: 'dd_days', kind: 'days' },
  { field: 'Close (days)', col: 'close_days', kind: 'days' },
  { field: 'Deposit', col: 'deposit', kind: 'money' },
  { field: 'DD Expiry', col: 'dd_expiry', kind: 'date' },

  // Notes
  { field: 'Notes', col: 'notes', kind: 'text' },
];

/** Excel number format for the Value column based on kind */
export function numFmt(kind: SyncKind): string | null {
  switch (kind) {
    case 'int':   return '#,##0';
    case 'days':  return '0';
    case 'money': return '$#,##0';
    case 'acres': return '0.00';
    case 'pct':   return '0.0"%"';     // user enters 10.5 to mean 10.5%
    case 'date':  return 'yyyy-mm-dd';
    default:      return null;
  }
}

/** Parse a value cell from the workbook to the type stored in the DB */
export function parseValue(kind: SyncKind, raw: unknown): unknown {
  if (raw == null || raw === '') return null;

  // Some cells come back as { result: ... } from formulas
  let v: unknown = raw;
  if (typeof v === 'object' && v !== null && 'result' in (v as Record<string, unknown>)) {
    v = (v as { result: unknown }).result;
  }
  if (typeof v === 'object' && v !== null && 'text' in (v as Record<string, unknown>)) {
    v = (v as { text: string }).text;
  }

  const asStr = (x: unknown) => (x == null ? '' : String(x).trim());
  const asNum = (x: unknown) => {
    if (typeof x === 'number') return x;
    const s = asStr(x).replace(/[$,\s]/g, '');
    if (s === '' || s === '—' || s === '-') return null;
    const n = parseFloat(s);
    return isFinite(n) ? n : null;
  };

  switch (kind) {
    case 'text':
    case 'stage':
      return asStr(v) || null;

    case 'int':
    case 'days': {
      const n = asNum(v);
      return n == null ? null : Math.round(n);
    }

    case 'money':
    case 'acres': {
      return asNum(v);
    }

    case 'pct': {
      const n = asNum(v);
      if (n == null) return null;
      // Heuristic: if value is between 0 and 1.5, it's already a decimal.
      // Otherwise treat as a percentage and divide.
      return Math.abs(n) <= 1.5 ? n : n / 100;
    }

    case 'date': {
      if (v instanceof Date) return v.toISOString().split('T')[0];
      const s = asStr(v);
      if (!s) return null;
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
    }

    default:
      return v;
  }
}
