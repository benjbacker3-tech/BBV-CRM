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

  const warmthColors = { hot: 'bg-red-100 text-red-700', warm: 'bg-amber-100 text-amber-700', cool: 'bg-blue-100 text-blue-700' };

  return (
    <div>
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Deal Contacts</h4>
        <button onClick={() => setAdding(!adding)} className="text-xs text-amber hover:text-amber-dark font-medium">
          {adding ? 'Cancel' : '+ Add'}
        </button>
      </div>

      {adding && (
        <div className="space-y-2 mb-4 p-3 bg-gray-50 dark:bg-surface-dark rounded-lg">
          <input placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
            className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200" />
          <div className="flex gap-2">
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as 'broker' | 'owner' })}
              className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200">
              <option value="broker">Broker</option>
              <option value="owner">Owner</option>
            </select>
            <select value={form.warmth} onChange={e => setForm({ ...form, warmth: e.target.value as 'hot' | 'warm' | 'cool' })}
              className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200">
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cool">Cool</option>
            </select>
          </div>
          <input placeholder="Firm" value={form.firm} onChange={e => setForm({ ...form, firm: e.target.value })}
            className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200" />
          <input placeholder="Phone" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })}
            className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200" />
          <input placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })}
            className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200" />
          <button onClick={addContact} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">Add Contact</button>
        </div>
      )}

      <div className="space-y-2">
        {contacts.map(c => (
          <div key={c.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${warmthColors[c.warmth]}`}>
                {c.warmth}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">{c.firm} &middot; {c.type}</p>
            {c.phone && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{c.phone}</p>}
            {c.email && <p className="text-xs text-blue-600 mt-0.5">{c.email}</p>}
          </div>
        ))}
        {contacts.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No contacts yet</p>}
      </div>
    </div>
  );
}
