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

const KIND_PILL: Record<CompKind, string> = { lease: 'pill-navy', sale: 'pill-green', availability: 'pill-blue' };

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
    return <div className="page"><div className="skeleton h-7 w-40 mb-6" /><div className="skeleton h-96 w-full rounded-xl" /></div>;
  }

  const cols = tab === 'review' ? [] : COLUMNS[tab];

  return (
    <div className="page">
      {/* Header */}
      <div className="page-header">
        <div>
          <p className="eyebrow">Sandpiper Capital LLC · Market Intelligence</p>
          <h1 className="page-title">Comps</h1>
          <p className="page-sub">Lease comps, sale comps and availabilities by market</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { window.location.href = '/api/comps/export'; }}
            className="btn-secondary"
            title="Rebuild the West Region tracking workbook (one tab per market)"
          >
            Export xlsx
          </button>
          <button
            onClick={() => setEditing({ kind: tab === 'review' ? 'lease' : tab, market: market === 'All' ? 'Denver' : market })}
            className="btn-primary"
          >
            + Add Comp
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs mb-5">
        {([['lease', 'Lease Comps', counts.lease], ['sale', 'Sale Comps', counts.sale], ['availability', 'Availabilities', counts.availability], ['review', 'To Review', pending.length]] as [Tab, string, number][]).map(([t, label, n]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`tab inline-flex items-center gap-1.5 ${tab === t ? 'tab-active' : ''}`}
          >
            {label}
            {t === 'review' && n > 0
              ? <span className="pill pill-amber font-mono">{n}</span>
              : <span className="count">{n}</span>}
          </button>
        ))}
      </div>

      {tab !== 'review' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <select value={market} onChange={e => setMarket(e.target.value)} className="field !w-auto">
              <option value="All">All markets ({Object.values(marketCounts).reduce((a, b) => a + b, 0)})</option>
              {[...MARKETS, ...Object.keys(marketCounts).filter(m => !MARKETS.includes(m))].map(m => (
                <option key={m} value={m}>{m} ({marketCounts[m] || 0})</option>
              ))}
            </select>
            <select value={since} onChange={e => setSince(e.target.value as 'all' | '12' | '24')} className="field !w-auto">
              <option value="all">All dates</option>
              <option value="12">Last 12 months</option>
              <option value="24">Last 24 months</option>
            </select>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search address, tenant, landlord, broker…"
              className="field flex-1 max-w-sm"
            />
            <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto"><span className="font-mono tabular-nums">{rows.length}</span> comps · click a row to edit</span>
          </div>

          {/* Table */}
          <div className="card overflow-x-auto">
            <table className="table-clean">
              <thead>
                <tr>
                  {cols.map((c, i) => (
                    <th key={i} className={c.right ? '!text-right' : ''}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {marketsInOrder.map(mk => {
                  const group = rows.filter(r => (r.market || 'Other') === mk);
                  return (
                    <Fragment key={mk}>
                      <tr className="group-row">
                        <td colSpan={cols.length}>
                          {mk}
                          <span className="count ml-2">{group.length}</span>
                        </td>
                      </tr>
                      {group.map(r => (
                        <tr key={r.id} onClick={() => setEditing(r)} className="row cursor-pointer">
                          {cols.map((c, i) => (
                            <td key={i} className={`whitespace-nowrap ${c.right ? 'num' : ''} ${c.bold ? 'font-semibold !text-slate-900 dark:!text-slate-100' : ''}`}>
                              {c.render(r)}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="total-row">
                        {cols.map((c, i) => (
                          <td key={i} className={`whitespace-nowrap ${c.right ? 'num' : ''}`}>
                            {i === 0 ? `${mk} · Average` : c.value && c.fmt ? c.fmt(mean(group.map(c.value))) : ''}
                          </td>
                        ))}
                      </tr>
                    </Fragment>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={cols.length} className="!py-16 text-center text-sm !text-slate-400">No comps match these filters.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
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
      <div className="card px-6 py-12 text-center">
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Nothing to review.</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">The daily Outlook sync drops comps and availabilities it finds in broker emails here for you to accept, edit or reject.</p>
      </div>
    );
  }
  const outlookLink = (id: string) => `https://outlook.office365.com/owa/?ItemID=${encodeURIComponent(id)}&exvsurl=1&viewmodel=ReadMessageItem`;
  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="section-label">To Review <span className="count">{pending.length}</span></h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{pending.length} comps found in email, waiting for review.</p>
        </div>
        <button onClick={onAcceptAll} className="btn-secondary">Accept all</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="table-clean">
          <thead>
            <tr>
              {['Kind', 'Market', 'Address', 'City', 'Size', 'Economics', 'Parties', 'Source', ''].map(h => (
                <th key={h}>{h}</th>
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
                <tr key={c.id} className="row [&>td]:!align-top">
                  <td><span className={`pill capitalize ${KIND_PILL[c.kind] ?? 'pill-slate'}`}>{c.kind}</span></td>
                  <td>{c.market || dash}</td>
                  <td className="font-semibold !text-slate-900 dark:!text-slate-100">{c.address}</td>
                  <td>{c.city || dash}</td>
                  <td className="font-mono tabular-nums whitespace-nowrap">{[c.sf ? `${int0(c.sf)} SF` : null, c.acres ? `${dec2(c.acres)} ac` : null].filter(Boolean).join(' · ') || dash}</td>
                  <td className="font-mono tabular-nums">{econ || dash}</td>
                  <td>{parties || dash}</td>
                  <td className="!text-slate-500 dark:!text-slate-400 max-w-xs">
                    {c.source_note || dash}
                    {c.source_ref && !c.source_ref.startsWith('file:') && (
                      <> · <a href={outlookLink(c.source_ref)} target="_blank" rel="noreferrer" className="text-navy dark:text-blue-300 underline">Open email</a></>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <div className="inline-flex items-center gap-1">
                      <button onClick={() => onAccept(c)} className="btn-primary">Accept</button>
                      <button onClick={() => onEdit(c)} className="btn-secondary">Edit</button>
                      <button onClick={() => onReject(c)} className="btn-danger">Reject</button>
                    </div>
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

  const input = 'field';
  const F = ({ k, label, type = 'text', span = 1, placeholder }: { k: string; label: string; type?: string; span?: 1 | 2 | 3; placeholder?: string }) => (
    <div className={span === 3 ? 'col-span-3' : span === 2 ? 'col-span-2' : ''}>
      <label className="field-label">{label}</label>
      <input type={type} step="any" value={f[k] ?? ''} onChange={e => set(k, e.target.value)} placeholder={placeholder} className={input} />
    </div>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]" />
      <div className="card relative w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="card-header">
          <h2 className="card-title flex items-center gap-2">{isNew ? 'Add comp' : comp.address}{isPending && <span className="pill pill-amber">Pending review</span>}</h2>
          <button onClick={onClose} className="btn-ghost !px-2 text-base leading-none" aria-label="Close">×</button>
        </div>
        <div className="card-body">
        {comp.source_note && <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-4">Source: {comp.source_note}</p>}

        <div className="grid grid-cols-3 gap-3 mb-6">
          <div>
            <label className="field-label">Kind</label>
            <select value={kind} onChange={e => set('kind', e.target.value)} className={input}>
              <option value="lease">Lease comp</option>
              <option value="sale">Sale comp</option>
              <option value="availability">Availability</option>
            </select>
          </div>
          <div>
            <label className="field-label">Market</label>
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

        <h3 className="section-label mb-2">Property</h3>
        <div className="grid grid-cols-3 gap-3 mb-6">
          {F({ k: "sf", label: "Building SF", type: "number" })}
          {F({ k: "acres", label: "Acres", type: "number" })}
          {F({ k: "zoning", label: "Zoning" })}
          {F({ k: "yard", label: "Yard (Asphalt, Rock…)" })}
          {F({ k: "fence", label: "Fenced" })}
          {F({ k: "lit", label: "Lit" })}
          {F({ k: "doors", label: "Doors (terminals)", type: "number" })}
          {F({ k: "depth", label: "Depth (terminals)", type: "number" })}
        </div>

        <h3 className="section-label mb-2">Economics</h3>
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
            <label className="field-label">Notes</label>
            <textarea rows={2} value={f.notes ?? ''} onChange={e => set('notes', e.target.value)} className={input} />
          </div>
        </div>

        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-[11px] text-slate-700 dark:text-slate-300 font-mono tabular-nums flex flex-wrap gap-x-5 gap-y-1">
          <span>Cvg {pct1(m.coverage)}</span>
          {kind === 'sale' ? (
            <><span>{money2(m.priceLsf)} / LSF</span><span>{money0(m.priceBsf)} / BSF</span></>
          ) : (
            <><span>{money0(m.rentMonthly)} / mo</span><span>{money2(m.rentLsfMo)} / LSF / mo</span><span>{money2(m.rentBsfYr)} / BSF / yr</span><span>{money0(m.rentAcreMo)} / acre / mo</span>{m.grossLsfMo && <span>Gross {money2(m.grossLsfMo)} / LSF</span>}</>
          )}
        </div>

        </div>

        <div className="flex items-center gap-2 px-4 py-3 border-t border-slate-100 dark:border-slate-800">
          {!isNew && <button onClick={remove} className="btn-danger">Delete</button>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={onClose} className="btn-secondary">Cancel</button>
            {isPending ? (
              <>
                <button onClick={() => save(false)} disabled={saving} className="btn-secondary">Save, keep in review</button>
                <button onClick={() => save(true)} disabled={saving} className="btn-primary">Save & accept</button>
              </>
            ) : (
              <button onClick={() => save(false)} disabled={saving} className="btn-primary">{isNew ? 'Add comp' : 'Save'}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
