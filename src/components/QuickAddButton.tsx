'use client';

import { useState, useEffect } from 'react';

export default function QuickAddButton() {
  const [modalOpen, setModalOpen] = useState(false);

  // Keyboard shortcut: N (when not focused on input)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); setModalOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <>
      <div className="fixed bottom-6 right-6 z-50">
        <button
          onClick={() => setModalOpen(true)}
          title="New Deal (N)"
          className="w-12 h-12 rounded-full bg-navy text-white shadow-lg hover:bg-navy-light transition-all flex items-center justify-center"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>

      {modalOpen && <DealModal onClose={() => setModalOpen(false)} />}
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
        className="w-full border border-gray-200 dark:border-gray-600 dark:bg-surface-dark rounded px-2.5 py-1.5 text-sm dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-navy" />
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
        <button onClick={submit} className="w-full py-2 bg-navy text-white rounded text-sm hover:bg-navy-light font-medium">Create Deal</button>
      </div>
    </ModalWrapper>
  );
}
