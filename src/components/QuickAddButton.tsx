'use client';

import { useState, useEffect, useRef } from 'react';
import { STAGES, Stage } from '@/lib/utils';

type Modal = null | 'deal' | 'contact' | 'task';

export default function QuickAddButton() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [modal, setModal] = useState<Modal>(null);

  // Keyboard shortcuts: N, C, T (when not focused on input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setModal('deal'); setMenuOpen(false); }
      if (e.key === 'c' || e.key === 'C') { e.preventDefault(); setModal('contact'); setMenuOpen(false); }
      if (e.key === 't' || e.key === 'T') { e.preventDefault(); setModal('task'); setMenuOpen(false); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      {/* FAB */}
      <div className="fixed bottom-6 right-6 z-50">
        {menuOpen && (
          <div className="absolute bottom-14 right-0 bg-white dark:bg-surface border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl overflow-hidden animate-fade-in w-44">
            {[
              { key: 'deal' as const, label: 'Add Deal', icon: '🏗️', shortcut: 'N' },
              { key: 'contact' as const, label: 'Add Contact', icon: '👤', shortcut: 'C' },
              { key: 'task' as const, label: 'Add Task', icon: '✓', shortcut: 'T' },
            ].map(item => (
              <button key={item.key} onClick={() => { setModal(item.key); setMenuOpen(false); }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <span>{item.icon}</span>
                <span className="flex-1 text-left">{item.label}</span>
                <kbd className="text-[10px] px-1 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-400 rounded font-mono">{item.shortcut}</kbd>
              </button>
            ))}
          </div>
        )}
        <button onClick={() => setMenuOpen(!menuOpen)} title="Quick add (N, C, T)"
          className={`w-12 h-12 rounded-full bg-amber text-white shadow-lg hover:bg-amber-dark transition-all flex items-center justify-center ${menuOpen ? 'rotate-45' : ''}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {/* Modals */}
      {modal === 'deal' && <DealModal onClose={() => setModal(null)} />}
      {modal === 'contact' && <ContactModal onClose={() => setModal(null)} />}
      {modal === 'task' && <TaskModal onClose={() => setModal(null)} />}
    </>
  );
}

function ModalWrapper({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 dark:bg-black/60" />
      <div className="relative bg-white dark:bg-surface rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 w-full max-w-md p-5 animate-fade-in"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InputField({ label, value, onChange, type, placeholder, autoFocus }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; placeholder?: string; autoFocus?: boolean;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
      <input type={type || 'text'} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus}
        className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber" />
    </div>
  );
}

function DealModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', market: '', address: '', asking_price: '', acreage: '', yoc_target: '', stage: 'Tracking', source: '' });
  const submit = async () => {
    if (!f.name.trim()) return;
    await fetch('/api/deals', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, asking_price: parseFloat(f.asking_price) || 0, acreage: parseFloat(f.acreage) || 0, yoc_target: parseFloat(f.yoc_target) || 0,
        submarket: '', zoning: '', ios_eligible: 1, dd_expiry: '', notes: '' }) });
    onClose(); window.location.reload();
  };
  return (
    <ModalWrapper title="New Deal" onClose={onClose}>
      <div className="space-y-3">
        <InputField label="Deal Name *" value={f.name} onChange={v => setF({ ...f, name: v })} autoFocus placeholder="e.g. Port Houston Yard" />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Market" value={f.market} onChange={v => setF({ ...f, market: v })} placeholder="Houston" />
          <InputField label="Source" value={f.source} onChange={v => setF({ ...f, source: v })} placeholder="CBRE Listing" />
        </div>
        <InputField label="Address" value={f.address} onChange={v => setF({ ...f, address: v })} />
        <div className="grid grid-cols-3 gap-3">
          <InputField label="Asking Price" value={f.asking_price} onChange={v => setF({ ...f, asking_price: v })} type="number" />
          <InputField label="Acreage" value={f.acreage} onChange={v => setF({ ...f, acreage: v })} type="number" />
          <InputField label="YoC (%)" value={f.yoc_target} onChange={v => setF({ ...f, yoc_target: v })} type="number" />
        </div>
        <button onClick={submit} className="w-full py-2 bg-amber text-white rounded text-sm hover:bg-amber-dark font-medium">Create Deal</button>
      </div>
    </ModalWrapper>
  );
}

function ContactModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ name: '', firm: '', phone: '', email: '', markets: '', type: 'broker', warmth: 'cool' });
  const submit = async () => {
    if (!f.name.trim()) return;
    await fetch('/api/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, deal_id: null, last_contact: new Date().toISOString().split('T')[0], notes: '' }) });
    onClose(); window.location.reload();
  };
  return (
    <ModalWrapper title="New Contact" onClose={onClose}>
      <div className="space-y-3">
        <InputField label="Name *" value={f.name} onChange={v => setF({ ...f, name: v })} autoFocus placeholder="John Smith" />
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Firm" value={f.firm} onChange={v => setF({ ...f, firm: v })} placeholder="CBRE" />
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Type</label>
            <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber">
              <option value="broker">Broker</option><option value="owner">Owner</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <InputField label="Phone" value={f.phone} onChange={v => setF({ ...f, phone: v })} placeholder="555-555-0100" />
          <InputField label="Email" value={f.email} onChange={v => setF({ ...f, email: v })} type="email" />
        </div>
        <InputField label="Markets" value={f.markets} onChange={v => setF({ ...f, markets: v })} placeholder="Houston, DFW" />
        <button onClick={submit} className="w-full py-2 bg-amber text-white rounded text-sm hover:bg-amber-dark font-medium">Create Contact</button>
      </div>
    </ModalWrapper>
  );
}

function TaskModal({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ note: '', type: 'call', due_date: new Date().toISOString().split('T')[0], contact_id: '' });
  const [contacts, setContacts] = useState<{ id: number; name: string }[]>([]);
  useEffect(() => { fetch('/api/contacts').then(r => r.json()).then(setContacts); }, []);
  const submit = async () => {
    if (!f.note.trim() || !f.contact_id) return;
    await fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...f, contact_id: parseInt(f.contact_id), done: 0 }) });
    onClose(); window.location.reload();
  };
  return (
    <ModalWrapper title="New Task" onClose={onClose}>
      <div className="space-y-3">
        <InputField label="Task *" value={f.note} onChange={v => setF({ ...f, note: v })} autoFocus placeholder="Follow up on LOI" />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Type</label>
            <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}
              className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber">
              <option value="call">Call</option><option value="email">Email</option><option value="coffee">Coffee</option>
            </select>
          </div>
          <InputField label="Due Date" value={f.due_date} onChange={v => setF({ ...f, due_date: v })} type="date" />
        </div>
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Contact *</label>
          <select value={f.contact_id} onChange={e => setF({ ...f, contact_id: e.target.value })}
            className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-amber">
            <option value="">Select contact...</option>
            {contacts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={submit} className="w-full py-2 bg-amber text-white rounded text-sm hover:bg-amber-dark font-medium">Create Task</button>
      </div>
    </ModalWrapper>
  );
}
