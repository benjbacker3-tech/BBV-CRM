'use client';

import { useEffect, useState } from 'react';
import { Contact } from '@/lib/utils';

interface Props {
  dealId: number;
}

export default function ContactsTab({ dealId }: Props) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<{ name: string; type: 'broker' | 'owner'; firm: string; phone: string; email: string; markets: string; warmth: 'hot' | 'warm' | 'cool'; notes: string }>({ name: '', type: 'broker', firm: '', phone: '', email: '', markets: '', warmth: 'cool', notes: '' });

  useEffect(() => {
    fetch(`/api/contacts?deal_id=${dealId}`).then(r => r.json()).then(setContacts);
  }, [dealId]);

  const addContact = async () => {
    await fetch('/api/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, deal_id: dealId, last_contact: new Date().toISOString().split('T')[0] }),
    });
    fetch(`/api/contacts?deal_id=${dealId}`).then(r => r.json()).then(setContacts);
    setAdding(false);
    setForm({ name: '', type: 'broker', firm: '', phone: '', email: '', markets: '', warmth: 'cool', notes: '' });
  };

  const warmthColors = { hot: 'pill-red', warm: 'pill-amber', cool: 'pill-slate' };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="section-label">
          Deal Contacts
          <span className="count">{contacts.length}</span>
        </h4>
        <button onClick={() => setAdding(!adding)} className={adding ? 'btn-ghost' : 'btn-secondary'}>
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {adding && (
        <div className="card card-body space-y-3">
          <div>
            <label className="field-label">Name</label>
            <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as 'broker' | 'owner' })} className="field">
                <option value="broker">Broker</option>
                <option value="owner">Owner</option>
              </select>
            </div>
            <div>
              <label className="field-label">Warmth</label>
              <select value={form.warmth} onChange={e => setForm({ ...form, warmth: e.target.value as 'hot' | 'warm' | 'cool' })} className="field">
                <option value="hot">Hot</option>
                <option value="warm">Warm</option>
                <option value="cool">Cool</option>
              </select>
            </div>
          </div>
          <div>
            <label className="field-label">Firm</label>
            <input placeholder="Firm" value={form.firm} onChange={e => setForm({ ...form, firm: e.target.value })} className="field" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Phone</label>
              <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="field font-mono tabular-nums" />
            </div>
            <div>
              <label className="field-label">Email</label>
              <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="field" />
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={addContact} className="btn-primary">Add Contact</button>
          </div>
        </div>
      )}

      <div className="card divide-y divide-slate-100 dark:divide-slate-800">
        {contacts.map(c => (
          <div key={c.id} className="px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-slate-900 dark:text-slate-100 truncate">{c.name}</span>
              <span className={`pill capitalize ${warmthColors[c.warmth]}`}>
                {c.warmth}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{c.firm} &middot; <span className="capitalize">{c.type}</span></p>
            {(c.phone || c.email) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                {c.phone && <span className="font-mono tabular-nums text-slate-600 dark:text-slate-300">{c.phone}</span>}
                {c.email && <span className="text-navy dark:text-blue-300 truncate">{c.email}</span>}
              </div>
            )}
          </div>
        ))}
        {contacts.length === 0 && <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-6">No contacts yet</p>}
      </div>
    </div>
  );
}
