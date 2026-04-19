import { NextResponse } from 'next/server';
import { all, get, run } from '@/lib/db';
import { normalizePhone, phonesMatch } from '@/lib/phone';

interface OpenPhoneCall {
  id: string;
  direction: string;
  status: string;
  createdAt: string;
  completedAt: string | null;
  duration: number;
  from: string;
  to: string;
  participants: string[];
}

interface OpenPhoneMessage {
  id: string;
  direction: string;
  from: string;
  to: string;
  text: string;
  createdAt: string;
}

interface Contact {
  id: number;
  phone: string;
  name: string;
}

export async function GET() {
  const sync = await get('SELECT * FROM openphone_sync ORDER BY id DESC LIMIT 1');
  return NextResponse.json(sync || { last_sync_at: null, status: 'ok', error_message: null, calls_synced: 0, messages_synced: 0 });
}

export async function POST() {
  const apiKey = process.env.OPENPHONE_API_KEY;
  const phoneNumberId = process.env.OPENPHONE_NUMBER_ID;

  if (!apiKey || apiKey === 'your_openphone_api_key_here') {
    await run(
      `INSERT INTO openphone_sync (last_sync_at, status, error_message, calls_synced, messages_synced) VALUES (datetime('now'), 'error', ?, 0, 0)`,
      ['OPENPHONE_API_KEY not configured in .env.local']
    );
    return NextResponse.json({ error: 'API key not configured' }, { status: 400 });
  }

  if (!phoneNumberId || phoneNumberId === 'PNyour_number_id_here') {
    await run(
      `INSERT INTO openphone_sync (last_sync_at, status, error_message, calls_synced, messages_synced) VALUES (datetime('now'), 'error', ?, 0, 0)`,
      ['OPENPHONE_NUMBER_ID not configured in .env.local']
    );
    return NextResponse.json({ error: 'Phone number ID not configured' }, { status: 400 });
  }

  const settings = await get<{ sync_enabled: number; track_personal: number; personal_number: string }>(
    'SELECT * FROM openphone_settings WHERE id = 1'
  );
  if (!settings) return NextResponse.json({ error: 'Settings missing' }, { status: 500 });
  if (!settings.sync_enabled) return NextResponse.json({ message: 'Sync disabled' });

  const lastSync = await get<{ last_sync_at: string }>(
    `SELECT last_sync_at FROM openphone_sync WHERE status = 'ok' ORDER BY id DESC LIMIT 1`
  );
  const createdAfter = lastSync?.last_sync_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  try {
    const headers = { Authorization: apiKey };

    const callsUrl = new URL('https://api.openphone.com/v1/calls');
    callsUrl.searchParams.set('phoneNumberId', phoneNumberId);
    callsUrl.searchParams.set('maxResults', '100');
    callsUrl.searchParams.set('createdAfter', createdAfter);

    const callsRes = await fetch(callsUrl.toString(), { headers });
    if (!callsRes.ok) throw new Error(`Calls API error ${callsRes.status}: ${await callsRes.text()}`);
    const callsData = await callsRes.json();
    const calls: OpenPhoneCall[] = callsData.data || [];

    const msgsUrl = new URL('https://api.openphone.com/v1/messages');
    msgsUrl.searchParams.set('phoneNumberId', phoneNumberId);
    msgsUrl.searchParams.set('maxResults', '100');
    msgsUrl.searchParams.set('createdAfter', createdAfter);

    const msgsRes = await fetch(msgsUrl.toString(), { headers });
    if (!msgsRes.ok) throw new Error(`Messages API error ${msgsRes.status}: ${await msgsRes.text()}`);
    const msgsData = await msgsRes.json();
    const messages: OpenPhoneMessage[] = msgsData.data || [];

    const contacts = await all<Contact>('SELECT id, phone, name FROM contacts');
    const personalNorm = normalizePhone(settings.personal_number);
    let callsSynced = 0;
    let messagesSynced = 0;

    for (const call of calls) {
      const dupe = await get('SELECT id FROM contact_log WHERE external_id = ?', [call.id]);
      if (dupe) continue;

      const otherNumber = call.direction === 'incoming' ? call.from : call.to;
      if (!otherNumber) continue;

      if (!settings.track_personal && personalNorm && phonesMatch(otherNumber, settings.personal_number)) continue;

      const date = call.createdAt.split('T')[0];
      const durationMin = Math.round((call.duration || 0) / 60);
      const note = `${call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} call — ${durationMin}m${call.status === 'completed' ? '' : ` (${call.status})`}`;

      let contactId = findContactByPhone(contacts, otherNumber);
      if (!contactId) {
        const res = await run(
          `INSERT INTO contacts (deal_id, type, name, firm, phone, email, markets, warmth, last_contact, notes)
           VALUES (NULL, 'broker', ?, '', ?, '', '', 'cool', ?, 'Auto-created from OpenPhone sync')`,
          [`Unknown (${otherNumber})`, otherNumber, date]
        );
        contactId = res.lastInsertRowid;
        contacts.push({ id: contactId, phone: otherNumber, name: `Unknown (${otherNumber})` });
      }

      await run(
        `INSERT INTO contact_log (contact_id, type, note, date, external_id, source) VALUES (?, 'call', ?, ?, ?, 'openphone')`,
        [contactId, note, date, call.id]
      );
      await run('UPDATE contacts SET last_contact = ? WHERE id = ?', [date, contactId]);
      callsSynced++;
    }

    for (const msg of messages) {
      const dupe = await get('SELECT id FROM contact_log WHERE external_id = ?', [msg.id]);
      if (dupe) continue;

      const otherNumber = msg.direction === 'incoming' ? msg.from : msg.to;
      if (!otherNumber) continue;

      if (!settings.track_personal && personalNorm && phonesMatch(otherNumber, settings.personal_number)) continue;

      const date = msg.createdAt.split('T')[0];
      const direction = msg.direction === 'incoming' ? 'Received' : 'Sent';
      const preview = msg.text ? (msg.text.length > 120 ? msg.text.slice(0, 120) + '...' : msg.text) : '(no text)';
      const note = `${direction} SMS: ${preview}`;

      let contactId = findContactByPhone(contacts, otherNumber);
      if (!contactId) {
        const res = await run(
          `INSERT INTO contacts (deal_id, type, name, firm, phone, email, markets, warmth, last_contact, notes)
           VALUES (NULL, 'broker', ?, '', ?, '', '', 'cool', ?, 'Auto-created from OpenPhone sync')`,
          [`Unknown (${otherNumber})`, otherNumber, date]
        );
        contactId = res.lastInsertRowid;
        contacts.push({ id: contactId, phone: otherNumber, name: `Unknown (${otherNumber})` });
      }

      await run(
        `INSERT INTO contact_log (contact_id, type, note, date, external_id, source) VALUES (?, 'sms', ?, ?, ?, 'openphone')`,
        [contactId, note, date, msg.id]
      );
      await run('UPDATE contacts SET last_contact = ? WHERE id = ?', [date, contactId]);
      messagesSynced++;
    }

    await run(
      `INSERT INTO openphone_sync (last_sync_at, status, error_message, calls_synced, messages_synced) VALUES (datetime('now'), 'ok', NULL, ?, ?)`,
      [callsSynced, messagesSynced]
    );

    return NextResponse.json({ callsSynced, messagesSynced });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await run(
      `INSERT INTO openphone_sync (last_sync_at, status, error_message, calls_synced, messages_synced) VALUES (datetime('now'), 'error', ?, 0, 0)`,
      [message]
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function findContactByPhone(contacts: Contact[], phone: string): number | null {
  for (const c of contacts) {
    if (c.phone && phonesMatch(c.phone, phone)) return c.id;
  }
  return null;
}
