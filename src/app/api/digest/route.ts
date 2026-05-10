import { NextResponse } from 'next/server';
import { all } from '@/lib/db';

interface TaskRow { note: string; type: string; due_date: string; contact_name: string }
interface DDRow { name: string; dd_expiry: string; days_left: number }
interface StaleRow { name: string; last_activity: string; days_stale: number }

function buildDigestHTML(data: {
  overdue: TaskRow[]; today: TaskRow[]; ddExpiring: DDRow[]; staleDeals: StaleRow[]; date: string;
}) {
  const section = (title: string, content: string) => content ? `
    <tr><td style="padding: 20px 0 8px 0;">
      <h2 style="margin:0;font-size:14px;color:#BA7517;text-transform:uppercase;letter-spacing:1px;border-bottom:1px solid #e5e7eb;padding-bottom:6px;">${title}</h2>
    </td></tr>
    <tr><td style="padding:0 0 8px 0;">${content}</td></tr>` : '';

  const taskRow = (t: TaskRow, extra?: string) => `
    <tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:8px 0;font-size:13px;color:#374151;">${t.contact_name || 'Unassigned'}</td>
      <td style="padding:8px 0;font-size:13px;color:#374151;">${t.type}</td>
      <td style="padding:8px 0;font-size:13px;color:#374151;">${t.note}</td>
      ${extra ? `<td style="padding:8px 0;font-size:13px;color:#dc2626;font-weight:600;">${extra}</td>` : ''}
    </tr>`;

  const overdueHtml = data.overdue.length > 0 ? `<table style="width:100%;border-collapse:collapse;">
    <tr style="border-bottom:2px solid #e5e7eb;">
      <th style="text-align:left;padding:4px 0;font-size:11px;color:#9ca3af;text-transform:uppercase;">Contact</th>
      <th style="text-align:left;padding:4px 0;font-size:11px;color:#9ca3af;text-transform:uppercase;">Type</th>
      <th style="text-align:left;padding:4px 0;font-size:11px;color:#9ca3af;text-transform:uppercase;">Task</th>
      <th style="text-align:left;padding:4px 0;font-size:11px;color:#9ca3af;text-transform:uppercase;">Overdue</th>
    </tr>
    ${data.overdue.map(t => {
      const days = Math.ceil((Date.now() - new Date(t.due_date).getTime()) / 86400000);
      return taskRow(t, `${days}d`);
    }).join('')}
  </table>` : '<p style="font-size:13px;color:#9ca3af;">No overdue tasks — nice work.</p>';

  const todayHtml = data.today.length > 0 ? `<table style="width:100%;border-collapse:collapse;">
    ${data.today.map(t => taskRow(t)).join('')}
  </table>` : '<p style="font-size:13px;color:#9ca3af;">No tasks due today.</p>';

  const ddHtml = data.ddExpiring.length > 0 ? `<table style="width:100%;border-collapse:collapse;">
    ${data.ddExpiring.map(d => `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:8px 0;font-size:13px;color:#374151;">${d.name}</td>
      <td style="padding:8px 0;font-size:13px;color:${d.days_left <= 7 ? '#dc2626' : '#BA7517'};font-weight:600;font-family:monospace;">${d.days_left}d remaining</td>
    </tr>`).join('')}
  </table>` : '';

  const staleHtml = data.staleDeals.length > 0 ? `<table style="width:100%;border-collapse:collapse;">
    ${data.staleDeals.map(d => `<tr style="border-bottom:1px solid #f3f4f6;">
      <td style="padding:8px 0;font-size:13px;color:#374151;">${d.name}</td>
      <td style="padding:8px 0;font-size:13px;color:#dc2626;font-family:monospace;">${d.days_stale}d no activity</td>
    </tr>`).join('')}
  </table>` : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Inter',Arial,sans-serif;">
  <table style="width:100%;max-width:600px;margin:0 auto;background:#ffffff;">
    <tr><td style="background:#0B1A2B;padding:24px 30px;">
      <h1 style="margin:0;font-size:18px;color:#ffffff;"><span style="color:#BA7517;">MCI</span> Morning Briefing</h1>
      <p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">${data.date}</p>
    </td></tr>
    <tr><td style="padding:20px 30px;">
      ${section('⚠️ Overdue Tasks', overdueHtml)}
      ${section('📋 Due Today', todayHtml)}
      ${data.ddExpiring.length > 0 ? section('🏗️ DD Expirations (14d)', ddHtml) : ''}
      ${data.staleDeals.length > 0 ? section('🚨 Stale Deals (14d+ no activity)', staleHtml) : ''}
    </td></tr>
    <tr><td style="background:#f9fafb;padding:16px 30px;border-top:1px solid #e5e7eb;">
      <p style="margin:0;font-size:11px;color:#9ca3af;">Mission Critical Industrial · Industrial Outdoor Storage</p>
    </td></tr>
  </table>
</body></html>`;
}

export async function GET() {
  const today = new Date().toISOString().split('T')[0];

  const overdue = await all<TaskRow>(
    `SELECT t.note, t.type, t.due_date, c.name as contact_name FROM tasks t
     LEFT JOIN contacts c ON t.contact_id = c.id WHERE t.done = 0 AND t.due_date < ?
     ORDER BY t.due_date`,
    [today]
  );

  const todayTasks = await all<TaskRow>(
    `SELECT t.note, t.type, t.due_date, c.name as contact_name FROM tasks t
     LEFT JOIN contacts c ON t.contact_id = c.id WHERE t.done = 0 AND t.due_date = ?`,
    [today]
  );

  const ddExpiringRaw = await all<{ name: string; dd_expiry: string; days_left: number }>(
    `SELECT name, dd_expiry, CAST(julianday(dd_expiry) - julianday('now') AS INTEGER) as days_left
     FROM deals WHERE stage = 'Under Contract' AND dd_expiry IS NOT NULL
     AND julianday(dd_expiry) - julianday('now') BETWEEN 0 AND 14
     ORDER BY dd_expiry`
  );
  const ddExpiring: DDRow[] = ddExpiringRaw.map(d => ({ ...d, days_left: Number(d.days_left) }));

  const staleDealsRaw = await all<{ name: string; last_activity: string; days_stale: number }>(
    `SELECT name, last_activity, days_stale FROM (
       SELECT d.name,
         COALESCE((SELECT MAX(created_at) FROM activity_log WHERE entity_type = 'deal' AND entity_id = d.id), d.created_at) as last_activity,
         CAST(julianday('now') - julianday(COALESCE((SELECT MAX(created_at) FROM activity_log WHERE entity_type = 'deal' AND entity_id = d.id), d.created_at)) AS INTEGER) as days_stale
       FROM deals d WHERE d.stage NOT IN ('Closed', 'Dead')
     ) WHERE days_stale >= 14 ORDER BY days_stale DESC`
  );
  const staleDeals: StaleRow[] = staleDealsRaw.map(d => ({ ...d, days_stale: Number(d.days_stale) }));

  const html = buildDigestHTML({
    overdue, today: todayTasks, ddExpiring, staleDeals,
    date: new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  });

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html' } });
}

export async function POST() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey === 'your_resend_api_key_here') {
    return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 400 });
  }

  const digestRes = await GET();
  const html = await digestRes.text();

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.DIGEST_FROM || 'MCI CRM <onboarding@resend.dev>',
      to: [process.env.DIGEST_TO || 'ben@missioncriticalindustrial.com'],
      subject: `MCI Morning Briefing — ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Resend API error: ${err}` }, { status: 500 });
  }

  return NextResponse.json({ sent: true });
}
