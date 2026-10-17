'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Deal, STAGES, Stage, fmt } from '@/lib/utils';
import DealDetailPanel from '@/components/DealDetailPanel';

// Map tab: every deal as a pin on Google's satellite imagery, colored by stage. Pins come from
// the deals' addresses (looked up free via /api/deals/geocode); a deal that can't be found is
// listed under "Not on map" and can be placed by hand. Pins found only approximately (OpenStreetMap)
// are drawn lighter; drag them into place with Move pins. Click a pin to open the deal.

const KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY;

const STAGE_COLOR: Record<Stage, string> = {
  'Tracking': '#8F8F98',
  'LOI Submitted': '#3B82F6',
  'Negotiating PSA': '#F59E0B',
  'Under Contract': '#7C3AED',
  'Closed': '#10B981',
  'Dead': '#DC2626',
};

// The few Google Maps pieces this page uses (the SDK loads at runtime from Google).
interface LatLng { lat(): number; lng(): number }
interface GMap { fitBounds(b: unknown, pad?: number): void; setCenter(c: { lat: number; lng: number }): void; setZoom(z: number): void; setOptions(o: Record<string, unknown>): void; addListener(ev: string, fn: (e: { latLng: LatLng }) => void): { remove(): void } }
interface GMarker { setMap(m: GMap | null): void; addListener(ev: string, fn: (e: { latLng: LatLng }) => void): void; setDraggable(d: boolean): void }
interface GoogleMaps {
  Map: new (el: HTMLElement, o: Record<string, unknown>) => GMap;
  Marker: new (o: Record<string, unknown>) => GMarker;
  LatLngBounds: new () => { extend(p: { lat: number; lng: number }): void };
  SymbolPath: { CIRCLE: number };
}
declare global { interface Window { google?: { maps: GoogleMaps }; __sandpiperMapsReady?: () => void } }

let loading: Promise<GoogleMaps> | null = null;
function loadMaps(): Promise<GoogleMaps> {
  if (window.google?.maps?.Map) return Promise.resolve(window.google.maps);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      window.__sandpiperMapsReady = () => resolve(window.google!.maps);
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(KEY || '')}&v=weekly&callback=__sandpiperMapsReady`;
      s.async = true;
      s.onerror = () => { loading = null; reject(new Error('Google Maps did not load')); };
      document.head.appendChild(s);
    });
  }
  return loading;
}

const DEFAULT_SHOWN: Stage[] = ['Tracking', 'LOI Submitted', 'Negotiating PSA', 'Under Contract', 'Closed'];

export default function MapPage() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [shown, setShown] = useState<Set<Stage>>(new Set(DEFAULT_SHOWN));
  const [selected, setSelected] = useState<Deal | null>(null);
  const [placing, setPlacing] = useState<Deal | null>(null);
  const [adjust, setAdjust] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(KEY ? null : 'Add NEXT_PUBLIC_GOOGLE_MAPS_KEY in Vercel to show the map.');
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<GMap | null>(null);
  const gm = useRef<GoogleMaps | null>(null);
  const markers = useRef<GMarker[]>([]);
  const fitted = useRef(false);

  const load = useCallback(() => fetch('/api/deals').then(r => r.json()).then((d: Deal[]) => setDeals(d)), []);

  // Load deals, then look up pins for any deal without one.
  useEffect(() => {
    load().then(() => fetch('/api/deals/geocode', { method: 'POST' })).then(r => r.json()).then(r => {
      if (r?.placed) { setNote(`Placed ${r.placed} deal${r.placed === 1 ? '' : 's'} from their addresses.`); load(); }
    }).catch(() => {});
  }, [load]);

  // Create the map once.
  useEffect(() => {
    if (!KEY || !box.current) return;
    loadMaps().then(g => {
      gm.current = g;
      map.current = new g.Map(box.current!, {
        center: { lat: 39.5, lng: -105 },
        zoom: 5,
        mapTypeId: 'hybrid',
        tilt: 0,
        mapTypeControl: true,
        streetViewControl: true,
        fullscreenControl: true,
        clickableIcons: false,
        gestureHandling: 'greedy',
      });
      setDeals(d => (d ? [...d] : d));   // draw pins now that the map exists
    }).catch(e => setMapError(e.message));
  }, []);

  const save = useCallback(async (d: Deal, lat: number, lng: number) => {
    await fetch(`/api/deals/${d.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lng, geo: 'manual' }) });
    await load();
  }, [load]);

  // Draw pins for the shown stages.
  useEffect(() => {
    const g = gm.current, m = map.current;
    if (!g || !m || !deals) return;
    markers.current.forEach(mk => mk.setMap(null));
    markers.current = [];
    const bounds = new g.LatLngBounds();
    let any = false;
    for (const d of deals) {
      if (d.lat == null || d.lng == null || !shown.has(d.stage as Stage)) continue;
      const mk = new g.Marker({
        map: m,
        position: { lat: d.lat, lng: d.lng },
        title: `${d.name} · ${d.stage}${d.asking_price ? ` · ${fmt(d.asking_price)}` : ''}${d.geo === 'osm' ? ' · approximate location: use Move pins to correct' : ''}`,
        draggable: adjust,
        icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: STAGE_COLOR[d.stage as Stage] || '#8F8F98', fillOpacity: d.geo === 'osm' ? 0.45 : 1, strokeColor: '#FFFFFF', strokeWeight: 2 },
      });
      mk.addListener('click', () => setSelected(d));
      mk.addListener('dragend', e => save(d, e.latLng.lat(), e.latLng.lng()));
      markers.current.push(mk);
      bounds.extend({ lat: d.lat, lng: d.lng });
      any = true;
    }
    if (any && !fitted.current) { m.fitBounds(bounds, 60); fitted.current = true; }
  }, [deals, shown, adjust, save]);

  // Placing an unmapped deal: the next click on the map sets its pin.
  useEffect(() => {
    const m = map.current;
    if (!m || !placing) return;
    m.setOptions({ draggableCursor: 'crosshair' });
    const h = m.addListener('click', async e => {
      await save(placing, e.latLng.lat(), e.latLng.lng());
      setNote(`${placing.name} placed.`);
      setPlacing(null);
    });
    return () => { h.remove(); m.setOptions({ draggableCursor: null }); };
  }, [placing, save]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of deals || []) if (d.lat != null) c[d.stage] = (c[d.stage] || 0) + 1;
    return c;
  }, [deals]);
  const unplaced = (deals || []).filter(d => d.lat == null && d.stage !== 'Dead');

  const toggle = (s: Stage) => setShown(prev => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-2.5 md:px-6">
        <h1 className="mr-2 text-base font-semibold tracking-tight text-slate-900">Map</h1>
        {STAGES.map(s => (
          <button
            key={s}
            onClick={() => toggle(s)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${shown.has(s) ? 'border-slate-300 bg-white text-slate-800' : 'border-slate-200 bg-slate-50 text-slate-400'}`}
          >
            <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white" style={{ background: shown.has(s) ? STAGE_COLOR[s] : '#CBCBD0' }} />
            {s}
            <span className="font-mono text-[10px] text-slate-400">{counts[s] || 0}</span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {unplaced.length > 0 && (
            <select
              className="field !w-auto !py-1 !text-[11px]"
              value={placing?.id ?? ''}
              onChange={e => setPlacing(unplaced.find(d => d.id === Number(e.target.value)) || null)}
              title="Deals whose address couldn't be found. Pick one, then click the map where it is."
            >
              <option value="">Not on map ({unplaced.length})…</option>
              {unplaced.map(d => <option key={d.id} value={d.id}>{d.name}{d.city ? `, ${d.city}` : ''}</option>)}
            </select>
          )}
          <button onClick={() => setAdjust(a => !a)} className={adjust ? 'btn-primary !py-1' : 'btn-secondary !py-1'} title="Drag pins to correct their location">
            {adjust ? 'Done moving pins' : 'Move pins'}
          </button>
        </div>
      </div>

      {(placing || note || mapError) && (
        <div className={`px-4 py-1.5 text-xs md:px-6 ${mapError ? 'bg-red-50 text-red-700' : 'bg-navy/5 text-navy'}`}>
          {mapError || (placing ? `Click the map where ${placing.name} is. ` : note)}
          {placing && <button className="ml-2 underline" onClick={() => setPlacing(null)}>Cancel</button>}
          {!placing && note && <button className="ml-2 underline" onClick={() => setNote(null)}>Dismiss</button>}
        </div>
      )}

      <div ref={box} className="relative min-h-[420px] flex-1 bg-slate-200" />

      {selected && (
        <DealDetailPanel
          deal={selected}
          onClose={() => setSelected(null)}
          onUpdate={u => { setSelected(u); load(); }}
          onDelete={() => { setSelected(null); load(); }}
        />
      )}
    </div>
  );
}
