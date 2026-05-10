'use client';

import { useState, useEffect, useCallback } from 'react';
import { Contact, Task } from '@/lib/utils';

interface LogEntry {
  id: number;
  contact_id: number;
  type: 'call' | 'email' | 'coffee' | 'sms';
  note: string;
  date: string;
  source?: string;
  external_id?: string;
}

interface SyncStatus {
  last_sync_at: string | null;
  status: string;
  error_message: string | null;
  calls_synced: number;
  messages_synced: number;
}

interface Props {
  contact: Contact;
  onClose: () => void;
  onUpdate: () => void;
}

type Tab = 'Info' | 'Tasks' | 'Log' | 'Deals';

export default function ContactDetailPanel({ contact, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('Info');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [deals, setDeals] = useState<{ id: number; name: string; stage: string }[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  // Inline edit state for the contact's own fields
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Contact>(contact);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Re-initialize the edit form whenever the contact prop changes
  useEffect(() => { setEditForm(contact); setEditing(false); }, [contact]);

  const saveContact = async () => {
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editForm),
    });
    if (res.ok) {
      setEditing(false);
      onUpdate();
    }
  };

  const deleteContact = async () => {
    await fetch(`/api/contacts/${contact.id}`, { method: 'DELETE' });
    setConfirmDelete(false);
    onUpdate();
    onClose();
  };

  const loadData = useCallback(() => {
    fetch(`/api/tasks?contact_id=${contact.id}`).then(r => r.json()).then(setTasks);
    fetch(`/api/contact-log?contact_id=${contact.id}`).then(r => r.json()).then(setLogs);
    fetch('/api/openphone/sync').then(r => r.json()).then(setSyncStatus);
    if (contact.deal_id) {
      fetch(`/api/deals/${contact.deal_id}`).then(r => r.json()).then(d => setDeals([d]));
    }
  }, [contact.id, contact.deal_id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Add task
  const [addingTask, setAddingTask] = useState(false);
  const [taskForm, setTaskForm] = useState<{ type: 'call' | 'email' | 'coffee'; note: string; due_date: string }>({ type: 'call', note: '', due_date: '' });

  const addTask = async () => {
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...taskForm, contact_id: contact.id }),
    });
    setAddingTask(false);
    setTaskForm({ type: 'call', note: '', due_date: '' });
    loadData();
    onUpdate();
  };

  const completeTask = async (taskId: number) => {
    await fetch(`/api/tasks/${taskId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done: 1 }),
    });
    loadData();
    onUpdate();
  };

  // Add log
  const [addingLog, setAddingLog] = useState(false);
  const [logForm, setLogForm] = useState<{ type: 'call' | 'email' | 'coffee' | 'sms'; note: string; date: string }>({ type: 'call', note: '', date: new Date().toISOString().split('T')[0] });

  const addLog = async () => {
    await fetch('/api/contact-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...logForm, contact_id: contact.id }),
    });
    setAddingLog(false);
    setLogForm({ type: 'call', note: '', date: new Date().toISOString().split('T')[0] });
    loadData();
    onUpdate();
  };

  const warmthColors = {
    hot: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    warm: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    cool: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  };
  const typeIcons: Record<string, string> = { call: '📞', email: '✉️', coffee: '☕', sms: '💬' };

  return (
    <div className="fixed right-0 top-0 h-screen w-[480px] bg-white dark:bg-surface border-l border-gray-200 dark:border-gray-700 shadow-xl flex flex-col z-50">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-start justify-between shrink-0">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{contact.name}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{contact.firm} &middot; {contact.type}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${warmthColors[contact.warmth]}`}>{contact.warmth}</span>
            {contact.phone && <span className="text-xs text-gray-500 dark:text-gray-400">{contact.phone}</span>}
          </div>
          {contact.email && <p className="text-xs text-blue-600 mt-1">{contact.email}</p>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setConfirmDelete(true)}
            title="Delete contact"
            className="text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M11 7V4a2 2 0 114 0v3" />
            </svg>
          </button>
          <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-700 px-5 shrink-0">
        {(['Info', 'Tasks', 'Log', 'Deals'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors ${
              tab === t ? 'border-amber text-amber' : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-5">
        {tab === 'Info' && (
          <InfoTab
            contact={contact}
            editing={editing}
            form={editForm}
            setForm={setEditForm}
            onEdit={() => setEditing(true)}
            onCancel={() => { setEditing(false); setEditForm(contact); }}
            onSave={saveContact}
          />
        )}
        {tab === 'Tasks' && (
          <div>
            <div className="flex justify-between items-center mb-3">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Tasks</h4>
              <button onClick={() => setAddingTask(!addingTask)} className="text-xs text-amber hover:text-amber-dark font-medium">
                {addingTask ? 'Cancel' : '+ Add'}
              </button>
            </div>

            {addingTask && (
              <div className="space-y-2 mb-4 p-3 bg-gray-50 dark:bg-surface-dark rounded-lg">
                <div className="flex gap-2">
                  <select value={taskForm.type} onChange={e => setTaskForm({ ...taskForm, type: e.target.value as typeof taskForm.type })}
                    className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200">
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="coffee">Coffee</option>
                  </select>
                  <input type="date" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })}
                    className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200" />
                </div>
                <input placeholder="Note" value={taskForm.note} onChange={e => setTaskForm({ ...taskForm, note: e.target.value })}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200" />
                <button onClick={addTask} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">Add</button>
              </div>
            )}

            <div className="space-y-2">
              {tasks.map(t => {
                const today = new Date().toISOString().split('T')[0];
                const isOverdue = !t.done && t.due_date < today;
                return (
                  <div key={t.id} className={`flex items-start gap-2 p-2 rounded ${t.done ? 'opacity-50' : ''}`}>
                    <button
                      onClick={() => !t.done && completeTask(t.id)}
                      className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center ${
                        t.done ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-amber'
                      }`}
                    >
                      {t.done && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs">{typeIcons[t.type]}</span>
                        <span className={`text-xs ${t.done ? 'line-through text-gray-400 dark:text-gray-500' : 'text-gray-700 dark:text-gray-300'}`}>{t.note}</span>
                      </div>
                      <span className={`text-[10px] font-mono ${isOverdue ? 'text-red-600' : 'text-gray-400 dark:text-gray-500'}`}>{t.due_date}</span>
                    </div>
                  </div>
                );
              })}
              {tasks.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No tasks</p>}
            </div>
          </div>
        )}

        {tab === 'Log' && (
          <div>
            <div className="flex justify-between items-center mb-3">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Contact Log</h4>
                {syncStatus && (
                  <div className="flex items-center gap-1" title={syncStatus.error_message || ''}>
                    <span className={`w-1.5 h-1.5 rounded-full ${syncStatus.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {syncStatus.last_sync_at
                        ? `Synced ${timeAgo(syncStatus.last_sync_at)}`
                        : 'Not synced'}
                    </span>
                  </div>
                )}
              </div>
              <button onClick={() => setAddingLog(!addingLog)} className="text-xs text-amber hover:text-amber-dark font-medium">
                {addingLog ? 'Cancel' : '+ Add'}
              </button>
            </div>

            {addingLog && (
              <div className="space-y-2 mb-4 p-3 bg-gray-50 dark:bg-surface-dark rounded-lg">
                <div className="flex gap-2">
                  <select value={logForm.type} onChange={e => setLogForm({ ...logForm, type: e.target.value as typeof logForm.type })}
                    className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200">
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="coffee">Coffee</option>
                    <option value="sms">SMS</option>
                  </select>
                  <input type="date" value={logForm.date} onChange={e => setLogForm({ ...logForm, date: e.target.value })}
                    className="border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200" />
                </div>
                <textarea placeholder="Notes" value={logForm.note} onChange={e => setLogForm({ ...logForm, note: e.target.value })}
                  rows={2} className="w-full border border-gray-200 dark:border-gray-600 rounded px-2 py-1.5 text-sm dark:bg-surface-dark dark:text-gray-200" />
                <button onClick={addLog} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">Add Entry</button>
              </div>
            )}

            <div className="space-y-2">
              {logs.map(l => (
                <div key={l.id} className={`border rounded-lg p-3 ${l.source === 'openphone' ? 'border-blue-100 bg-blue-50/30' : 'border-gray-100 dark:border-gray-700'}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs flex items-center gap-1">
                      {typeIcons[l.type] || '📝'} <span className="capitalize font-medium text-gray-700 dark:text-gray-300">{l.type}</span>
                      {l.source === 'openphone' && (
                        <span className="text-[9px] bg-blue-100 text-blue-600 px-1 py-0.5 rounded font-medium ml-1">OpenPhone</span>
                      )}
                    </span>
                    <span className="text-[10px] font-mono text-gray-400 dark:text-gray-500">{l.date}</span>
                  </div>
                  <p className="text-xs text-gray-600 dark:text-gray-300">{l.note}</p>
                </div>
              ))}
              {logs.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No log entries</p>}
            </div>
          </div>
        )}

        {tab === 'Deals' && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Related Deals</h4>
            <div className="space-y-2">
              {deals.map(d => (
                <div key={d.id} className="border border-gray-100 dark:border-gray-700 rounded-lg p-3">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{d.name}</span>
                  <span className="text-xs bg-navy/10 text-navy px-2 py-0.5 rounded-full ml-2">{d.stage}</span>
                </div>
              ))}
              {deals.length === 0 && <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">No related deals</p>}
            </div>
          </div>
        )}
      </div>

      {/* Delete confirmation overlay */}
      {confirmDelete && (
        <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10" onClick={() => setConfirmDelete(false)}>
          <div className="bg-white dark:bg-surface rounded-lg shadow-xl p-5 w-[360px] max-w-[90%]" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1">Delete &ldquo;{contact.name}&rdquo;?</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              This will permanently remove the contact and their tasks/log entries. This cannot be undone.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-800">
                Cancel
              </button>
              <button onClick={deleteContact} className="px-3 py-1.5 text-xs bg-red-600 text-white rounded hover:bg-red-700">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Info tab: view + edit the contact's own fields (name, firm, phone, email,
// markets, type, warmth, notes)
// -----------------------------------------------------------------------------

function InfoTab({
  contact, editing, form, setForm, onEdit, onCancel, onSave,
}: {
  contact: Contact;
  editing: boolean;
  form: Contact;
  setForm: (c: Contact) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  const inputCls = "w-full border border-gray-200 dark:border-gray-600 rounded px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-amber dark:bg-surface-dark dark:text-gray-200";

  if (editing) {
    return (
      <div className="space-y-3">
        <Field label="Name">
          <input value={form.name || ''} onChange={e => setForm({ ...form, name: e.target.value })} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as 'broker' | 'owner' })} className={inputCls}>
              <option value="broker">Broker</option>
              <option value="owner">Owner</option>
            </select>
          </Field>
          <Field label="Warmth">
            <select value={form.warmth} onChange={e => setForm({ ...form, warmth: e.target.value as 'hot' | 'warm' | 'cool' })} className={inputCls}>
              <option value="hot">Hot</option>
              <option value="warm">Warm</option>
              <option value="cool">Cool</option>
            </select>
          </Field>
        </div>
        <Field label="Firm">
          <input value={form.firm || ''} onChange={e => setForm({ ...form, firm: e.target.value })} className={inputCls} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Phone">
            <input value={form.phone || ''} onChange={e => setForm({ ...form, phone: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email || ''} onChange={e => setForm({ ...form, email: e.target.value })} className={inputCls} />
          </Field>
        </div>
        <Field label="Markets">
          <input value={form.markets || ''} onChange={e => setForm({ ...form, markets: e.target.value })} className={inputCls} placeholder="Houston, Dallas" />
        </Field>
        <Field label="Notes">
          <textarea rows={5} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} className={inputCls} />
        </Field>
        <div className="flex gap-2 pt-2 sticky bottom-0 bg-white dark:bg-surface pb-2">
          <button onClick={onSave} className="px-3 py-1.5 bg-amber text-white rounded text-sm hover:bg-amber-dark">Save</button>
          <button onClick={onCancel} className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded text-sm hover:bg-gray-200 dark:hover:bg-gray-600">Cancel</button>
        </div>
      </div>
    );
  }

  // Read-only view
  const fields = [
    { label: 'Firm', value: contact.firm },
    { label: 'Type', value: contact.type },
    { label: 'Markets', value: contact.markets },
    { label: 'Phone', value: contact.phone },
    { label: 'Email', value: contact.email },
    { label: 'Last Contact', value: contact.last_contact },
  ];

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button onClick={onEdit} className="text-xs text-amber hover:text-amber-dark font-medium">
          Edit
        </button>
      </div>
      <div className="space-y-2">
        {fields.map(f => (
          <div key={f.label} className="flex justify-between gap-3">
            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{f.label}</span>
            <span className="text-xs text-gray-900 dark:text-gray-100 text-right">{f.value || '—'}</span>
          </div>
        ))}
      </div>
      <div className="mt-5 pt-4 border-t border-gray-100 dark:border-gray-700">
        <h5 className="text-[10px] uppercase tracking-[0.12em] text-gray-400 dark:text-gray-500 font-semibold mb-2">Notes</h5>
        {contact.notes ? (
          <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">{contact.notes}</p>
        ) : (
          <p className="text-xs italic text-gray-400 dark:text-gray-500">No notes yet — click <span className="text-amber not-italic">Edit</span> to add some.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}
