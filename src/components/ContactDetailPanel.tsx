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

type Tab = 'Tasks' | 'Log' | 'Deals';

export default function ContactDetailPanel({ contact, onClose, onUpdate }: Props) {
  const [tab, setTab] = useState<Tab>('Tasks');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [deals, setDeals] = useState<{ id: number; name: string; stage: string }[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

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

  const warmthColors = { hot: 'bg-red-100 text-red-700', warm: 'bg-amber-100 text-amber-700', cool: 'bg-blue-100 text-blue-700' };
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
        <button onClick={onClose} className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 p-1">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-100 dark:border-gray-700 px-5 shrink-0">
        {(['Tasks', 'Log', 'Deals'] as const).map(t => (
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
