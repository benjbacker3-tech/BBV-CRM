'use client';

import { useEffect, useState, useCallback } from 'react';
import { Contact, Task, timeAgo } from '@/lib/utils';
import ContactDetailPanel from '@/components/ContactDetailPanel';

type SortKey = 'name' | 'firm' | 'markets' | 'warmth' | 'last_contact';
type SortDir = 'asc' | 'desc';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<'all' | 'broker' | 'owner'>('all');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [adding, setAdding] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>('last_contact');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [form, setForm] = useState<{
    name: string; type: 'broker' | 'owner'; firm: string; phone: string;
    email: string; markets: string; warmth: 'hot' | 'warm' | 'cool'; notes: string;
  }>({ name: '', type: 'broker', firm: '', phone: '', email: '', markets: '', warmth: 'cool', notes: '' });

  const load = useCallback(() => {
    fetch('/api/contacts').then(r => r.json()).then(setContacts);
    fetch('/api/tasks').then(r => r.json()).then(setTasks);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addContact = async () => {
    if (!form.name.trim()) return;
    await fetch('/api/contacts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, deal_id: null, last_contact: new Date().toISOString().split('T')[0] }),
    });
    setAdding(false);
    setForm({ name: '', type: 'broker', firm: '', phone: '', email: '', markets: '', warmth: 'cool', notes: '' });
    load();
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  if (contacts === null) {
    return (
      <div className="p-6">
        <div className="skeleton h-7 w-32 mb-5" />
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-12 w-full" />)}
        </div>
      </div>
    );
  }

  const filtered = filter === 'all' ? contacts : contacts.filter(c => c.type === filter);
  const sorted = [...filtered].sort((a, b) => {
    const av = a[sortKey] || '';
    const bv = b[sortKey] || '';
    const cmp = String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const getNextTask = (contactId: number): Task | undefined =>
    tasks.filter(t => t.contact_id === contactId && !t.done).sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  const today = new Date().toISOString().split('T')[0];
  const threeDays = new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0];
  const pendingTasks = tasks.filter(t => !t.done);
  const overdue = pendingTasks.filter(t => t.due_date < today).length;
  const dueToday = pendingTasks.filter(t => t.due_date === today).length;
  const dueThree = pendingTasks.filter(t => t.due_date >= today && t.due_date <= threeDays).length;

  const warmthColors: Record<string, string> = {
    hot: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    warm: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    cool: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };

  const SortHeader = ({ label, field }: { label: string; field: SortKey }) => (
    <th onClick={() => toggleSort(field)}
      className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none">
      {label} {sortKey === field && <span className="ml-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );

  return (
    <div className="flex h-full">
      <div className={`flex-1 overflow-auto transition-all ${selectedContact ? 'mr-[480px]' : ''}`}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Contacts</h1>
              <button onClick={() => setAdding(!adding)} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">
                {adding ? 'Cancel' : '+ Add Contact'}
              </button>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 text-xs">
                {overdue > 0 && <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-2 py-1 rounded-full font-medium">{overdue} overdue</span>}
                {dueToday > 0 && <span className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-1 rounded-full font-medium">{dueToday} due today</span>}
                <span className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 px-2 py-1 rounded-full font-medium">{dueThree} next 3d</span>
              </div>
              <div className="flex border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                {(['all', 'broker', 'owner'] as const).map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 text-xs capitalize ${filter === f ? 'bg-navy text-white' : 'bg-white dark:bg-surface text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {adding && (
            <div className="bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-5 animate-fade-in">
              <div className="grid grid-cols-3 gap-3">
                {[
                  { key: 'name', label: 'Name *', placeholder: 'John Smith' },
                  { key: 'firm', label: 'Firm', placeholder: 'CBRE' },
                  { key: 'phone', label: 'Phone', placeholder: '555-555-0100' },
                  { key: 'email', label: 'Email' },
                  { key: 'markets', label: 'Markets', placeholder: 'Houston, DFW' },
                  { key: 'notes', label: 'Notes' },
                ].map(({ key, label, placeholder }) => (
                  <div key={key}>
                    <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
                    <input value={(form as Record<string, string>)[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} placeholder={placeholder}
                      className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber" />
                  </div>
                ))}
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Type</label>
                  <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as 'broker' | 'owner' })}
                    className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200">
                    <option value="broker">Broker</option><option value="owner">Owner</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Warmth</label>
                  <select value={form.warmth} onChange={e => setForm({ ...form, warmth: e.target.value as 'hot' | 'warm' | 'cool' })}
                    className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200">
                    <option value="hot">Hot</option><option value="warm">Warm</option><option value="cool">Cool</option>
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <button onClick={addContact} className="px-4 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">Create Contact</button>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-surface rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-surface-dark">
                  <SortHeader label="Name" field="name" />
                  <SortHeader label="Firm" field="firm" />
                  <SortHeader label="Markets" field="markets" />
                  <SortHeader label="Warmth" field="warmth" />
                  <SortHeader label="Last Contact" field="last_contact" />
                  <th className="text-left py-2.5 px-4 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Next Task</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(c => {
                  const nextTask = getNextTask(c.id);
                  const isOverdue = nextTask && nextTask.due_date < today;
                  return (
                    <tr key={c.id} onClick={() => setSelectedContact(c)}
                      className={`border-b border-gray-50 dark:border-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 ${selectedContact?.id === c.id ? 'bg-amber/5 dark:bg-amber/10' : ''}`}>
                      <td className="py-2.5 px-4">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{c.name}</span>
                        <span className="text-xs text-gray-400 ml-1.5">{c.type}</span>
                      </td>
                      <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300">{c.firm}</td>
                      <td className="py-2.5 px-4 text-gray-600 dark:text-gray-300">{c.markets}</td>
                      <td className="py-2.5 px-4">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${warmthColors[c.warmth]}`} title={c.warmth}>{c.warmth}</span>
                      </td>
                      <td className="py-2.5 px-4 text-xs text-gray-500 dark:text-gray-400" title={c.last_contact}>{c.last_contact ? timeAgo(c.last_contact + 'T00:00:00') : '—'}</td>
                      <td className="py-2.5 px-4">
                        {nextTask ? (
                          <span className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-gray-500 dark:text-gray-400'}`} title={nextTask.due_date}>
                            {nextTask.type}: {timeAgo(nextTask.due_date + 'T00:00:00')}
                          </span>
                        ) : <span className="text-xs text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr><td colSpan={6} className="py-12 text-center text-sm text-gray-400 dark:text-gray-500">
                    No contacts found. Add your first contact to get started.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      {selectedContact && <ContactDetailPanel contact={selectedContact} onClose={() => setSelectedContact(null)} onUpdate={load} />}
    </div>
  );
}
