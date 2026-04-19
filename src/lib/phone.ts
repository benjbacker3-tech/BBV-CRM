/**
 * Normalize a phone number to E.164 format (+1XXXXXXXXXX).
 * Handles: "713-555-0142", "(713) 555-0142", "7135550142", "+17135550142", "1-713-555-0142"
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (digits.length > 11 && phone.startsWith('+')) return `+${digits}`;
  return null; // Unparseable
}

/**
 * Check if two phone numbers match after normalization.
 */
export function phonesMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normalizePhone(a);
  const nb = normalizePhone(b);
  if (!na || !nb) return false;
  return na === nb;
}

/**
 * Format a phone number for display: (XXX) XXX-XXXX
 */
export function formatPhone(phone: string | null | undefined): string {
  const n = normalizePhone(phone);
  if (!n) return phone || '';
  const d = n.slice(2); // Remove +1
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
