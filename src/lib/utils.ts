export function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtNum(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function fmtPct(n: number | null | undefined, decimals = 1): string {
  if (n == null) return '—';
  return `${fmtNum(n, decimals)}%`;
}

export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const target = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function ddChipColor(days: number | null): string {
  if (days == null) return 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
  if (days <= 7) return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
  if (days <= 14) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
  return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export const STAGES = [
  'Tracking',
  'LOI Submitted',
  'PSA Negotiation',
  'Under Contract',
  'Closed',
  'Dead',
] as const;

export type Stage = (typeof STAGES)[number];

export interface Deal {
  id: number;
  name: string;
  address: string;
  market: string;
  submarket: string;
  acreage: number;
  asking_price: number;
  yoc_target: number;
  zoning: string;
  ios_eligible: number;
  stage: Stage;
  source: string;
  dd_expiry: string | null;
  notes: string;
  pinned: number;
  created_at: string;
}

export interface Contact {
  id: number;
  deal_id: number | null;
  type: 'broker' | 'owner';
  name: string;
  firm: string;
  phone: string;
  email: string;
  markets: string;
  warmth: 'hot' | 'warm' | 'cool';
  last_contact: string;
  notes: string;
}

export interface Task {
  id: number;
  contact_id: number;
  type: 'call' | 'email' | 'coffee';
  note: string;
  due_date: string;
  done: number;
  created_at: string;
}

export interface Investor {
  id: number;
  name: string;
  type: string;
  commitment: number;
  called: number;
  status: string;
  notes: string;
}

export interface ActivityEntry {
  id: number;
  entity_type: string;
  entity_id: number;
  action: string;
  description: string;
  metadata: string | null;
  created_at: string;
}
