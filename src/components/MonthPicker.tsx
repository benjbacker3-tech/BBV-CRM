'use client';

export default function MonthPicker({ label, prev, next, onChange }: { month: string; label: string; prev: string; next: string; onChange: (m: string) => void }) {
  const btn = 'rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800';
  const chev = (d: string) => <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>;
  return (
    <div className="flex items-center gap-1">
      <button onClick={() => onChange(prev)} className={btn} aria-label="Previous month">{chev('M15 19l-7-7 7-7')}</button>
      <span className="min-w-[8.5rem] text-center text-sm font-medium text-slate-800">{label}</span>
      <button onClick={() => onChange(next)} className={btn} aria-label="Next month">{chev('M9 5l7 7-7 7')}</button>
    </div>
  );
}
