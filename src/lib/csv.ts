// Minimal RFC-4180 CSV parser. Handles quoted fields, embedded commas,
// embedded newlines, and "" escapes. Keeps the dependency footprint zero.

export function parseCSV(text: string): string[][] {
  // Strip UTF-8 BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(cell);
        cell = '';
      } else if (c === '\r') {
        // ignore — \n handles line break
      } else if (c === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += c;
      }
    }
  }
  // Flush trailing cell/row
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/** Build a lookup map from header row → column index, case-insensitive. */
export function indexHeaders(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headers.forEach((h, i) => map.set(h.trim().toLowerCase(), i));
  return map;
}

/** Get a value from a row by trying multiple possible header names */
export function pick(row: string[], idx: Map<string, number>, ...candidates: string[]): string {
  for (const name of candidates) {
    const i = idx.get(name.toLowerCase());
    if (i != null) {
      const v = (row[i] || '').trim();
      if (v) return v;
    }
  }
  return '';
}

/** Quote a CSV cell if needed (contains comma, quote, or newline) */
export function csvCell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildCSV(rows: (string | number | null)[][]): string {
  return rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}
