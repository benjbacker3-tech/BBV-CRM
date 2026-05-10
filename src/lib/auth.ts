// HMAC-signed session cookies. Edge-runtime compatible (uses Web Crypto, not Node crypto).
// Cookie format: `<username>|<exp_ms>|<hex_hmac_sha256(username|exp_ms, AUTH_SECRET)>`

export const SESSION_COOKIE = 'mci_session';
const TTL_DAYS = 30;
const ENCODER = new TextEncoder();

// Hardcoded user list. All share the same password ("breakfree").
// Lowercased usernames for case-insensitive login.
export const USERS: Record<string, string> = {
  eric: 'breakfree',
  ben: 'breakfree',
  anthony: 'breakfree',
};

// Pretty-print name for display (capitalized)
export function displayName(username: string): string {
  return username.charAt(0).toUpperCase() + username.slice(1);
}

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) {
    // Fallback for local dev. In prod, AUTH_SECRET must be set.
    return 'dev-only-secret-set-AUTH_SECRET-in-vercel';
  }
  return s;
}

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    ENCODER.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, ENCODER.encode(data));
  const bytes = new Uint8Array(sig);
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
}

export async function signSession(username: string): Promise<{ token: string; maxAge: number }> {
  const exp = Date.now() + TTL_DAYS * 86400_000;
  const payload = `${username}|${exp}`;
  const sig = await hmacHex(getSecret(), payload);
  return { token: `${payload}|${sig}`, maxAge: TTL_DAYS * 86400 };
}

export async function verifySession(token: string | undefined): Promise<{ username: string } | null> {
  if (!token) return null;
  const parts = token.split('|');
  if (parts.length !== 3) return null;
  const [username, expStr, sig] = parts;
  const exp = parseInt(expStr);
  if (!exp || exp < Date.now()) return null;
  const expected = await hmacHex(getSecret(), `${username}|${exp}`);
  // Constant-time comparison
  if (sig.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  return { username };
}

/** Validate username/password against the hardcoded user list (case-insensitive username). */
export function validateCredentials(username: string, password: string): string | null {
  const u = (username || '').trim().toLowerCase();
  if (!u || !USERS[u]) return null;
  if (USERS[u] !== password) return null;
  return u;
}
