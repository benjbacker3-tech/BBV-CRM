import { NextResponse } from 'next/server';
import { all, run } from '@/lib/db';
import { inferState } from '@/lib/utils';

export const maxDuration = 60;

// Looks up map pins for deals that don't have one yet. First the U.S. Census geocoder (free,
// no key, exact street addresses), then OpenStreetMap's Nominatim (free; finds partial
// addresses like "10275 E 106th" and wrong-suburb cities, less precisely, so those pins are
// marked 'osm' and shown as approximate). Deals neither can place are marked geo = 'none' so
// they aren't retried on every visit; a pin placed by hand (geo = 'manual') always wins.
const CENSUS = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const UA = 'SandpiperCapitalCRM/1.0 (+https://crm.sandpiperre.com)';   // Nominatim asks for an identifying agent

type Hit = { lat: number; lng: number; geo: 'census' | 'osm' };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function census(address: string): Promise<Hit | null> {
  const url = `${CENSUS}?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Census geocoder ${res.status}`);
  const m = (await res.json())?.result?.addressMatches?.[0]?.coordinates;
  return m && typeof m.x === 'number' && typeof m.y === 'number' ? { lat: m.y, lng: m.x, geo: 'census' } : null;
}

async function osm(q: string): Promise<Hit | null> {
  await sleep(1100);   // Nominatim's limit is one request per second
  const res = await fetch(`${NOMINATIM}?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(q)}`, {
    cache: 'no-store', headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`OpenStreetMap ${res.status}`);
  const m = (await res.json())?.[0];
  return m ? { lat: Number(m.lat), lng: Number(m.lon), geo: 'osm' } : null;
}

// Without a state, a partial address could match the wrong part of the country, so the
// looser OpenStreetMap searches only run when the state is known (or inferred from the city).
async function lookup(address: string, city: string | null, state: string | null): Promise<Hit | null> {
  const full = [address, city, state].filter(Boolean).join(', ');
  const hit = await census(full);
  if (hit || !state) return hit;
  return (await osm(full)) ?? (city ? await osm(`${address}, ${state}`) : null);   // the city may be the wrong suburb
}

export async function POST() {
  const deals = await all<{ id: number; address: string | null; city: string | null; state: string | null }>(
    "SELECT id, address, city, state FROM deals WHERE lat IS NULL AND (geo IS NULL OR geo = '') AND address IS NOT NULL AND address != ''",
  );
  let placed = 0, missed = 0;
  const errors: string[] = [];
  const started = Date.now();
  for (const d of deals) {
    if (Date.now() - started > 45_000) break;                     // the rest go next visit
    const where = [d.address, d.city, d.state].filter(Boolean).join(', ');
    try {
      const hit = await lookup(d.address!, d.city, inferState({ state: d.state, city: d.city ?? undefined }) || null);
      if (hit) { await run('UPDATE deals SET lat = ?, lng = ?, geo = ? WHERE id = ?', [hit.lat, hit.lng, hit.geo, d.id]); placed++; }
      else { await run("UPDATE deals SET geo = 'none' WHERE id = ?", [d.id]); missed++; }
    } catch (e) {
      errors.push(`${where}: ${e instanceof Error ? e.message : String(e)}`);   // left unmarked, retried next visit
    }
  }
  return NextResponse.json({ checked: deals.length, placed, missed, errors });
}
