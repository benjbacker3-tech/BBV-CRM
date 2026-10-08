'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Comp, CompKind, CompMetrics, MARKETS, MARKET_STATE, compMetrics } from '@/lib/comps';

type Tab = CompKind | 'review';

// ── formatting ───────────────────────────────────────────────────────────────
const dash = '—';
const n0 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const ok = (n: number | null | undefined): n is number => n != null && isFinite(n) && n !== 0;
const money0 = (n: number | null | undefined) => (ok(n) ? `$${n0.format(Math.round(n))}` : dash);
const money2 = (n: number | null | undefined) => (ok(n) ? `$${n.toFixed(2)}` : dash);
const pct1 = (n: number | null | undefined) => (ok(n) ? `${(n * 100).toFixed(1)}%` : dash);
const int0 = (n: number | null | undefined) => (ok(n) ? n0.format(n) : dash);
const dec2 = (n: number | null | undefined) => (ok(n) ? n.toFixed(2) : dash);
const dec1 = (n: number | null | undefined) => (n != null && isFinite(n) ? n.toFixed(1) : dash);
const monthYr = (s: string | null) => {
  if (!s) return null;
  const t = Date.parse(s);
  return isNaN(t) ? s : new Date(t).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
};

// ── columns per tab ──────────────────────────────────────────────────────────
type Row = Comp & { m: CompMetrics };
interface Col {
  label: string;
  right?: boolean;
  bold?: boolean;
  render: (r: Row) => React.ReactNode;
  value?: (r: Row) => number | null;   // averaged in the market subtotal row
  fmt?: (n: number | null) => string;
}

const text = (v: string | null | undefined) => v || dash;
const num = (label: string, value: (r: Row) => number | null, fmt: (n: number | null) => string, opts: Partial<Col> = {}): Col =>
  ({ label, right: true, value, fmt, render: r => fmt(value(r)), ...opts });

const COLUMNS: Record<CompKind, Col[]> = {
  lease: [
    { label: 'Date', render: r => monthYr(r.comp_date) || r.status || dash },
    { label: 'Address', bold: true, render: r => r.address },
    { label: 'City', render: r => text(r.city) },
    { label: 'Landlord', render: r => text(r.landlord) },
    { label: 'Tenant', render: r => text(r.tenant) },
    { label: 'Type', render: r => text(r.property_type) },
    num('SF', r => r.sf, int0),
    num('Acres', r => r.acres, dec2),
    num('Cvg', r => r.m.coverage, pct1),
    num('$ / Mo', r => r.m.rentMonthly, money0),
    num('$/LSF/Mo', r => r.m.rentLsfMo, money2),
    num('$/BSF/Yr', r => r.m.rentBsfYr, money2),
    num('$/Acre/Mo', r => r.m.rentAcreMo, money0),
    num('Bumps', r => r.bumps, pct1),
    num('Term', r => r.term_months, int0),
    { label: 'Broker', render: r => text(r.broker) },
  ],
  sale: [
    { label: 'Date', render: r => monthYr(r.comp_date) || r.status || dash },
    { label: 'Address', bold: true, render: r => r.address },
    { label: 'City', render: r => text(r.city) },
    { label: 'Buyer', render: r => text(r.buyer) },
    { label: 'Seller', render: r => text(r.seller) },
    { label: 'Type', render: r => text(r.property_type) },
    num('SF', r => r.sf, int0),
    num('Acres', r => r.acres, dec2),
    num('Cvg', r => r.m.coverage, pct1),
    num('Price', r => r.price, money0),
    num('$/LSF', r => r.m.priceLsf, money2),
    num('$/BSF', r => r.m.priceBsf, money0),
    { label: 'Occupancy', render: r => text(r.occupancy_note) },
    { label: 'Marketing', render: r => text(r.marketing) },
    num('IOV Price', r => r.alt_price, money0),
    { label: 'Broker', render: r => text(r.broker) },
  ],
  availability: [
    { label: 'Status', render: r => text(r.status) },
    { label: 'Address', bold: true, render: r => r.address },
    { label: 'City', render: r => text(r.city) },
    { label: 'Landlord', render: r => text(r.landlord) },
    { label: 'Type', render: r => text(r.property_type) },
    num('SF', r => r.sf, int0),
    num('Acres', r => r.acres, dec2),
    num('Cvg', r => r.m.coverage, pct1),
    num('Ask $ / Mo', r => r.m.rentMonthly, money0),
    num('$/LSF/Mo', r => r.m.rentLsfMo, money2),
    num('$/BSF/Yr', r => r.m.rentBsfYr, money2),
    num('$/Acre/Mo', r => r.m.rentAcreMo, money0),
    { label: 'Available', render: r => monthYr(r.available_date) || dash },
    num('TOM (mo)', r => r.m.tomMonths, dec1),
    { label: 'Broker', render: r => text(r.broker) },
  ],
};

const mean = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null && isFinite(x) && x !== 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

const dateOf = (c: Comp) => (c.kind === 'availability' ? c.available_date : c.comp_date);

export default function CompsPage() {
  const [approved, setApproved] = useState<Comp[] | null>(null);
  const [pending, setPending] = useState<Comp[]>([]);
  const [tab, setTab] = useState<Tab>('lease');
  const [market, setMarket] = useState('All');
  const [search, setSearch] = useState('');
  const [since, setSince] = useState<'all' | '12' | '24'>('all');
  const [editing, setEditing] = useState<Partial<Comp> | null>(null);

  const load = useCallback(async () => {
    const [a, p] = await Promise.all([
      fetch('/api/comps?review=approved').then(r => r.json()),
      fetch('/api/comps?review=pending').then(r => r.json()),
    ]);
    setApproved(a);
    setPending(p);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows: Row[] = useMemo(() => {
    if (!approved || tab === 'review') return [];
    const q = search.trim().toLowerCase();
    const cutoff = since === 'all' ? null : Date.now() - Number(since) * 30.4375 * 86_400_000;
    return approved
      .filter(c => c.kind === tab)
      .filter(c => market === 'All' || c.market === market)
      .filter(c => {
        if (cutoff == null) return true;
        const d = dateOf(c);
        return d != null && Date.parse(d) >= cutoff;
      })
      .filter(c => !q || [c.address, c.city, c.landlord, c.tenant, c.buyer, c.seller, c.broker, c.notes, c.submarket]
        .some(v => v?.toLowerCase().includes(q)))
      .map(c => ({ ...c, m: compMetrics(c) }));
  }, [approved, tab, market, search, since]);

  const counts = useMemo(() => {
    const out: Record<CompKind, number> = { lease: 0, sale: 0, availability: 0 };
    for (const c of approved || []) if (market === 'All' || c.market === market) out[c.kind]++;
    return out;
  }, [approved, market]);

  const marketCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of approved || []) if (tab === 'review' || c.kind === tab) out[c.market || 'Other'] = (out[c.market || 'Other'] || 0) + 1;
    return out;
  }, [approved, tab]);

  const marketsInOrder = useMemo(() => {
    const extra = Array.from(new Set(rows.map(r => r.market || 'Other'))).filter(m => !MARKETS.includes(m)).sort();
    return [...MARKETS, ...extra].filter(m => rows.some(r => (r.market || 'Other') === m));
  }, [rows]);

  const review = async (c: Comp, status: 'approved' | 'rejected') => {
    await fetch(`/api/comps/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review_status: status }) });
    load();
  };
  const acceptAll = async () => {
    if (!confirm(`Accept all ${pending.length} comps in the review queue?`)) return;
    await Promise.all(pending.map(c => fetch(`/api/comps/${c.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ review_status: 'approved' }) })));
    load();
  };

  if (!approved) {
    return <div className="p-8"><div className="skeleton h-7 w-40 mb-5" /><div className="skeleton h-96 w-full" /></div>;
  }

  const cols = tab === 'review' ? [] : COLUMNS[tab];

  return (
    <div className="px-8 py-8 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-end justify-between mb-5 pb-4 border-b border-gray-200">
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-gray-400 mb-1">Sandpiper Capital LLC · Market Intelligence</p>
          <h1 className="text-xl font-medium text-gray-900 tracking-tight">Comps</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setEditing({ kind: tab === 'review' ? 'lease' : tab, market: market === 'All' ? 'Denver' : market })}
            className="px-3 py-1.5 text-xs text-white bg-navy hover:bg-navy-light rounded"
          >
            + Add Comp
          </button>
          <button
            onClick={() => { window.location.href = '/api/comps/export'; }}
            className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            title="Rebuild the West Region tracking workbook (one tab per market)"
          >
            Export xlsx
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4 border-b border-gray-200">
        {([['lease', 'Lease Comps', counts.lease], ['sale', 'Sale Comps', counts.sale], ['availability', 'Availabilities', counts.availability], ['review', 'To Review', pending.length]] as [Tab, string, number][]).map(([t, label, n]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${tab === t ? 'border-navy text-navy' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
          >
            {label}
            <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] font-mono ${t === 'review' && n > 0 ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>{n}</span>
          </button>
        ))}
      </div>

      {tab !== 'review' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <select value={market} onChange={e => setMarket(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 bg-white">
              <option value="All">All markets ({Object.values(marketCounts).reduce((a, b) => a + b, 0)})</option>
              {[...MARKETS, ...Object.keys(marketCounts).filter(m => !MARKETS.includes(m))].map(m => (
                <option key={m} value={m}>{m} ({marketCounts[m] || 0})</option>
              ))}
            </select>
            <select value={since} onChange={e => setSince(e.target.value as 'all' | '12' | '24')} className="border border-gray-300 rounded px-2 py-1.5 text-xs text-gray-800 bg-white">
              <option value="all">All dates</option>
              <option value="12">Last 12 months</option>
              <option value="24">Last 24 months</option>
            </select>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search address, tenant, landlord, broker…"
              className="flex-1 max-w-sm border border-gray-300 rounded px-2.5 py-1.5 text-xs text-gray-800"
            />
            <span className="text-xs text-gray-500 ml-auto">{rows.length} comps · click a row to edit</span>
          </div>

          {/* Table */}
          <div className="overflow-x-auto border border-gray-300">
            <table className="w-full text-[11px] border-collapse">
              <thead>
                <tr className="bg-navy text-white">
                  {cols.map((c, i) => (
                    <th key={i} className={`py-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap ${c.right ? 'text-right' : 'text-left'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {marketsInOrder.map(mk => {
                  const group = rows.filter(r => (r.market || 'Other') === mk);
                  return (
                    <Fragment key={mk}>
                      <tr className="bg-gray-100 border-b border-gray-300">
                        <td colSpan={cols.length} className="py-1.5 px-2">
                          <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-navy">{mk}</span>
                          <span className="text-[10px] text-gray-500 font-mono ml-2">({group.length})</span>
                        </td>
                      </tr>
                      {group.map(r => (
                        <tr key={r.id} onClick={() => setEditing(r)} className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer">
                          {cols.map((c, i) => (
                            <td key={i} className={`py-1.5 px-2 whitespace-nowrap ${c.right ? 'text-right font-mono tabular-nums' : ''} ${c.bold ? 'font-semibold text-gray-900' : 'text-gray-800'}`}>
                              {c.render(r)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-400 bg-gray-50">
                        {cols.map((c, i) => (
                          <td key={i} className={`py-1.5 px-2 whitespace-nowrap font-semibold text-gray-900 ${c.right ? 'text-right font-mono tabular-nums' : ''}`}>
                            {i === 0 ? `${mk} · Average` : c.value && c.fmt ? c.fmt(mean(group.map(c.value))) : ''}
                          </td>
                        ))}
                      </tr>
                      <tr><td colSpan={cols.length} className="p-0 h-3" /></tr>
                    </Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={cols.length} className="py-16 text-center text-sm text-gray-400">No comps match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-gray-400">
            Rent is stored as total $/month; $/LSF/Mo is per land SF per month, $/BSF/Yr is per building SF per year. Averages are simple means of the rows shown, ignoring blanks.
          </p>
        </>
      )}

      {tab === 'review' && (
        <ReviewQueue pending={pending} onAccept={c => review(c, 'approved')} onReject={c => review(c, 'rejected')} onEdit={setEditing} onAcceptAll={acceptAll} />
      )}

      {editing && <CompModal comp={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

// ── Review queue ─────────────────────────────────────────────────────────────
function ReviewQueue({ pending, onAccept, onReject, onEdit, onAcceptAll }: {
  pending: Comp[]; onAccept: (c: Comp) => void; onReject: (c: Comp) => void; onEdit: (c: Comp) => void; onAcceptAll: () => void;
}) {
  if (!pending.length) {
    return (
      <div className="border border-gray-200 rounded-lg p-10 text-center">
        <p className="text-sm text-gray-700 mb-1">Nothing to review.</p>
        <p className="text-xs text-gray-500">The daily Outlook sync drops comps and availabilities it finds in broker emails here for you to accept, edit or reject.</p>
      </div>
    );
  }
  const outlookLink = (id: string) => `https://outlook.office365.com/owa/?ItemID=${encodeURIComponent(id)}&exvsurl=1&viewmodel=ReadMessageItem`;
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-600">{pending.length} comps found in email, waiting for review.</p>
        <button onClick={onAcceptAll} className="px-3 py-1.5 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50">Accept all</button>
      </div>
      <div className="border border-gray-300 overflow-x-auto">
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="bg-navy text-white text-left">
              {['Kind', 'Market', 'Address', 'City', 'Size', 'Economics', 'Parties', 'Source', ''].map(h => (
                <th key={h} className="py-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.06em]">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pending.map(c => {
              const m = compMetrics(c);
              const econ = c.kind === 'sale'
                ? [money0(c.price), m.priceLsf ? `${money2(m.priceLsf)}/LSF` : null].filter(Boolean).join(' · ')
                : [money0(m.rentMonthly) + '/mo', m.rentLsfMo ? `${money2(m.rentLsfMo)}/LSF/mo` : null, c.bumps ? `${pct1(c.bumps)} bumps` : null, c.term_months ? `${c.term_months} mo` : null].filter(Boolean).join(' · ');
              const parties = c.kind === 'sale' ? [c.buyer, c.seller].filter(Boolean).join(' ← ') : [c.landlord, c.tenant].filter(Boolean).join(' / ');
              return (
                <tr key={c.id} className="border-b border-gray-200 align-top">
                  <td className="py-2 px-2 capitalize">{c.kind}</td>
                  <td className="py-2 px-2">{c.market || dash}</td>
                  <td className="py-2 px-2 font-semibold text-gray-900">{c.address}</td>
                  <td className="py-2 px-2">{c.city || dash}</td>
                  <td className="py-2 px-2 font-mono whitespace-nowrap">{[c.sf ? `${int0(c.sf)} SF` : null, c.acres ? `${dec2(c.acres)} ac` : null].filter(Boolean).join(' · ') || dash}</td>
                  <td className="py-2 px-2 font-mono">{econ || dash}</td>
                  <td className="py-2 px-2">{parties || dash}</td>
                  <td className="py-2 px-2 text-gray-600 max-w-xs">
                    {c.source_note || dash}
                    {c.source_ref && !c.source_ref.startsWith('file:') && (
                      <> · <a href={outlookLink(c.source_ref)} target="_blank" rel="noreferrer" className="text-navy underline">Open email</a></>
                    )}
                  </td>
                  <td className="py-2 px-2 whitespace-nowrap text-right">
                    <button onClick={() => onAccept(c)} className="px-2 py-1 text-[11px] text-white bg-navy rounded hover:bg-navy-light mr-1">Accept</button>
                    <button onClick={() => onEdit(c)} className="px-2 py-1 text-[11px] text-gray-700 border border-gray-300 rounded hover:bg-gray-50 mr-1">Edit</button>
                    <button onClick={() => onReject(c)} className="px-2 py-1 text-[11px] text-red-700 border border-red-200 rounded hover:bg-red-50">Reject</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Add / edit modal ─────────────────────────────────────────────────────────
type Form = Record<string, string>;
const NUMERIC_FIELDS = ['sf', 'acres', 'rent_monthly', 'rent_plf', 'nnn_plf', 'price', 'alt_price', 'term_months', 'doors', 'depth', 'tom_months'];

function toForm(c: Partial<Comp>): Form {
  const f: Form = {};
  for (const [k, v] of Object.entries(c)) if (v != null && typeof v !== 'object') f[k] = String(v);
  f.bumps_pct = c.bumps != null ? String(+(c.bumps * 100).toFixed(3)) : '';
  return f;
}

function CompModal({ comp, onClose, onSaved }: { comp: Partial<Comp>; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(() => toForm(comp));
  const [saving, setSaving] = useState(false);
  const isNew = !comp.id;
  const kind = (f.kind || 'lease') as CompKind;
  const isPending = comp.review_status === 'pending';

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const set = (k: string, v: string) => setF(prev => ({ ...prev, [k]: v }));
  const nf = (k: string) => (f[k] && isFinite(parseFloat(f[k])) ? parseFloat(f[k]) : null);
  const m = compMetrics({
    sf: nf('sf'), acres: nf('acres'), rent_monthly: nf('rent_monthly'), rent_plf: nf('rent_plf'), nnn_plf: nf('nnn_plf'),
    price: nf('price'), doors: nf('doors'), available_date: f.available_date || null, tom_months: nf('tom_months'),
  });

  const save = async (accept = false) => {
    if (!f.address?.trim()) return;
    setSaving(true);
    const body: Record<string, unknown> = {};
    const keys = ['kind', 'market', 'status', 'comp_date', 'available_date', 'address', 'city', 'state', 'submarket', 'landlord', 'tenant', 'buyer', 'seller',
      'property_type', 'broker', 'zoning', 'yard', 'fence', 'lit', 'occupancy_note', 'marketing', 'notes', ...NUMERIC_FIELDS];
    for (const k of keys) body[k] = f[k] ?? null;
    body.bumps = f.bumps_pct ? parseFloat(f.bumps_pct) / 100 : null;
    if (!body.state && f.market) body.state = MARKET_STATE[f.market] ?? null;
    if (accept) body.review_status = 'approved';
    await fetch(isNew ? '/api/comps' : `/api/comps/${comp.id}`, {
      method: isNew ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    onSaved();
  };

  const remove = async () => {
    if (!confirm(`Delete ${comp.address}?`)) return;
    await fetch(`/api/comps/${comp.id}`, { method: 'DELETE' });
    onSaved();
  };

  const input = 'w-full border border-gray-300 rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-navy';
  const F = ({ k, label, type = 'text', span = 1, placeholder }: { k: string; label: string; type?: string; span?: 1 | 2 | 3; placeholder?: string }) => (
    <div className={span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : ''}>
      <label className="text-[11px] text-gray-500 block mb-0.5">{label}</label>
      <input type={type} step="any" value={f[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder={placeholder} className={input} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40" />
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{isNew ? 'Add comp' : comp.address}{isPending && <span className="ml-2 text-xs font-normal text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">Pending review</span>}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
        </div>
        {comp.source_note && <p className="text-[11px] text-gray-500 mb-4">Source: {comp.source_note}</p>}

        <div className="grid grid-cols-3 gap-3 mb-5">
          <div>
            <label className="text-[11px] text-gray-500 block mb-0.5">Kind</label>
            <select value={kind} onChange={e => set('kind', e.target.value)} className={input}>
              <option value="lease">Lease comp</option>
              <option value="sale">Sale comp</option>
              <option value="availability">Availability</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] text-gray-500 block mb-0.5">Market</label>
            <input list="markets" value={f.market ?? ''} onChange={e => set('market', e.target.value)} className={input} />
            <datalist id="markets">{MARKETS.map(mk => <option key={mk} value={mk} />)}</datalist>
          </div>
          {kind === 'availability' ? F({ k: "available_date", label: "Available date", type: "date" }) : F({ k: "comp_date", label: kind === 'sale' ? 'Sale date' : 'Lease date', type: "date" })}
          {F({ k: "address", label: "Address *", span: 2 })}
          {F({ k: "city", label: "City" })}
          {F({ k: "submarket", label: "Submarket" })}
          {F({ k: "status", label: kind === 'sale' ? 'Status (e.g. Pending)' : 'Status' })}
          {F({ k: "property_type", label: "Type (Equipment, Trailer…)" })}
          {kind === 'sale' ? (<>{F({ k: "buyer", label: "Buyer" })}{F({ k: "seller", label: "Seller" })}</>) : (<>{F({ k: "landlord", label: "Landlord" })}{F({ k: "tenant", label: "Tenant" })}</>)}
          {F({ k: "broker", label: "Broker" })}
        </div>

        <h3 className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-semibold mb-2">Property</h3>
        <div className="grid grid-cols-3 gap-3 mb-5">
          {F({ k: "sf", label: "Building SF", type: "number" })}
          {F({ k: "acres", label: "Acres", type: "number" })}
          {F({ k: "zoning", label: "Zoning" })}
          {F({ k: "yard", label: "Yard (Asphalt, Rock…)" })}
          {F({ k: "fence", label: "Fenced" })}
          {F({ k: "lit", label: "Lit" })}
          {F({ k: "doors", label: "Doors (terminals)", type: "number" })}
          {F({ k: "depth", label: "Depth (terminals)", type: "number" })}
        </div>

        <h3 className="text-[10px] uppercase tracking-[0.12em] text-gray-500 font-semibold mb-2">Economics</h3>
        <div className="grid grid-cols-3 gap-3 mb-3">
          {kind === 'sale' ? (
            <>
              {F({ k: "price", label: "Price ($)", type: "number" })}
              {F({ k: "alt_price", label: "IOV price ($)", type: "number" })}
              {F({ k: "occupancy_note", label: "Occupancy (Vacant, <1Y…)" })}
              {F({ k: "marketing", label: "Marketing (Off Market…)" })}
            </>
          ) : (
            <>
              {F({ k: "rent_monthly", label: kind === 'availability' ? 'Asking rent ($ / month)' : 'Rent ($ / month)', type: "number" })}
              {F({ k: "rent_plf", label: "…or $ / land SF / mo (if no acres)", type: "number" })}
              {F({ k: "nnn_plf", label: "NNN ($ / LSF / mo)", type: "number" })}
              {F({ k: "bumps_pct", label: "Bumps (%)", type: "number", placeholder: "3.5" })}
              {F({ k: "term_months", label: "Term (months)", type: "number" })}
              {kind === 'availability' && F({ k: "tom_months", label: "Time on market (mo, if no date)", type: "number" })}
            </>
          )}
          <div className="col-span-3">
            <label className="text-[11px] text-gray-500 block mb-0.5">Notes</label>
            <textarea rows={2} value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} className={input} />
          </div>
        </div>

        <div className="bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-5 text-[11px] text-gray-700 font-mono flex flex-wrap gap-x-5 gap-y-1">
          <span>Cvg {pct1(m.coverage)}</span>
          {kind === 'sale' ? (
            <><span>{money2(m.priceLsf)} / LSF</span><span>{money0(m.priceBsf)} / BSF</span></>
          ) : (
            <><span>{money0(m.rentMonthly)} / mo</span><span>{money2(m.rentLsfMo)} / LSF / mo</span><span>{money2(m.rentBsfYr)} / BSF / yr</span><span>{money0(m.rentAcreMo)} / acre / mo</span>{m.grossLsfMo && <span>Gross {money2(m.grossLsfMo)} / LSF</span>}</>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isPending ? (
            <>
              <button onClick={() => save(true)} disabled={saving} className="px-4 py-1.5 bg-navy text-white rounded text-sm hover:bg-navy-light disabled:opacity-50">Save & accept</button>
              <button onClick={() => save(false)} disabled={saving} className="px-4 py-1.5 border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50 disabled:opacity-50">Save, keep in review</button>
            </>
          ) : (
            <button onClick={() => save(false)} disabled={saving} className="px-4 py-1.5 bg-navy text-white rounded text-sm hover:bg-navy-light disabled:opacity-50">{isNew ? 'Add comp' : 'Save'}</button>
          )}
          <button onClick={onClose} className="px-4 py-1.5 text-gray-600 text-sm hover:text-gray-900">Cancel</button>
          {!isNew && <button onClick={remove} className="ml-auto px-3 py-1.5 text-red-700 text-sm hover:bg-red-50 rounded">Delete</button>}
        </div>
      </div>
    </div>
  );
}
