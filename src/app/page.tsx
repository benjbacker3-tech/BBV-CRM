'use client';

import { useEffect, useState } from 'react';
import { fmt } from '@/lib/utils';

interface DashboardData {
  dealsByStage: { stage: string; count: number }[];
  totalPipeline: number;
  activeDeals: number;
  investorStats: {
    total_investors: number;
    total_commitment: number;
    total_called: number;
    active_investors: number;
  };
  overdueTasks: number;
  dueTodayTasks: number;
  dueThreeDays: number;
  closedDeals: { count: number; total: number };
  underContract: number;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch('/api/dashboard').then(r => r.json()).then(setData);
  }, []);

  if (!data) return <LoadingSkeleton />;

  const uncalled = data.investorStats.total_commitment - data.investorStats.total_called;

  const cards = [
    {
      title: 'Deal Sourcing',
      color: 'border-blue-500',
      metrics: [
        { label: 'Active Pipeline', value: `${data.activeDeals} deals` },
        { label: 'Pipeline Value', value: fmt(data.totalPipeline) },
        { label: 'Under Contract', value: `${data.underContract}` },
      ],
    },
    {
      title: 'Capital Raising',
      color: 'border-emerald-500',
      metrics: [
        { label: 'Total Commitments', value: fmt(data.investorStats.total_commitment) },
        { label: 'Capital Called', value: fmt(data.investorStats.total_called) },
        { label: 'Uncalled Capital', value: fmt(uncalled) },
      ],
    },
    {
      title: 'Business Plan Execution',
      color: 'border-amber-500',
      metrics: [
        { label: 'Deals Closed', value: `${data.closedDeals.count}` },
        { label: 'Closed Volume', value: fmt(data.closedDeals.total) },
        { label: 'Under Contract', value: `${data.underContract}` },
      ],
    },
    {
      title: 'Asset Management',
      color: 'border-purple-500',
      metrics: [
        { label: 'Owned Assets', value: `${data.closedDeals.count}` },
        { label: 'Portfolio Value', value: fmt(data.closedDeals.total) },
        { label: 'Under DD', value: `${data.underContract}` },
      ],
    },
    {
      title: 'Investor Relations',
      color: 'border-cyan-500',
      metrics: [
        { label: 'Active Investors', value: `${data.investorStats.active_investors}` },
        { label: 'Total Investors', value: `${data.investorStats.total_investors}` },
        { label: 'Commitments', value: fmt(data.investorStats.total_commitment) },
      ],
    },
    {
      title: 'Follow-ups',
      color: 'border-red-500',
      metrics: [
        { label: 'Overdue', value: `${data.overdueTasks}`, warn: data.overdueTasks > 0 },
        { label: 'Due Today', value: `${data.dueTodayTasks}` },
        { label: 'Next 3 Days', value: `${data.dueThreeDays}` },
      ],
    },
  ];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const summary = `${data.activeDeals} active deals in pipeline (${fmt(data.totalPipeline)}), ${data.overdueTasks} overdue tasks, ${data.investorStats.active_investors} active investors.`;

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">{greeting}, Ben</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{summary}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map((card) => (
          <div
            key={card.title}
            className={`bg-white dark:bg-surface rounded-lg border-l-4 ${card.color} shadow-sm border border-gray-100 dark:border-gray-700 p-5`}
          >
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">{card.title}</h3>
            <div className="space-y-2">
              {card.metrics.map((m) => (
                <div key={m.label} className="flex justify-between items-center">
                  <span className="text-sm text-gray-500 dark:text-gray-400">{m.label}</span>
                  <span className={`font-mono text-sm font-semibold ${(m as { warn?: boolean }).warn ? 'text-red-600' : 'text-gray-900 dark:text-gray-100'}`}>
                    {m.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="p-6 max-w-7xl">
      <div className="h-8 w-64 bg-gray-200 rounded animate-pulse mb-2" />
      <div className="h-4 w-96 bg-gray-100 rounded animate-pulse mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg border border-gray-100 p-5 h-36 animate-pulse">
            <div className="h-4 w-32 bg-gray-200 rounded mb-4" />
            <div className="space-y-3">
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-full bg-gray-100 rounded" />
              <div className="h-3 w-full bg-gray-100 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
