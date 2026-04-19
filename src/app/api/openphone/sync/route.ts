import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
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

// GET: Return current sync status
export async function GET() {
  const db = getDb();
  const sync = db.prepare('SELECT * FROM openphone_sync ORDER BY id DESC LIMIT 1').get() as {
    last_sync_at: string | null;
    status: string;
    error_message: string | null;
    calls_synced: number;
    messages_synced: number;
  } | undefined;

  return NextResponse.json(sync || { last_sync_at: null, status: 'ok', error_message: null, calls_synced: 0, messages_synced: 0 });
}

// POST: Run a sync
export async function POST() {
  const db = getDb();

  const apiKey = process.env.OPENPHONE_API_KEY;
  const phoneNumberId = process.env.OPENPHONE_NUMBER_ID;

  if (!apiKey || apiKey === 'your_openphone_api_key_here') {
    db.prepare(`
      INSERT INTO openphone_sync (last_sync_at, status, error_message, calls_synced, messages_synced)
      VALUES (datetime('now'), 'error', 'OPENPHONE_API_KEY not configured in .env.local', 0, 0)
    `).run();
    return NextResponse.json({ error: 'API key not configured' }, { status: 400 });
  }

  if (!phoneNumberId || phoneNumberId === 'PNyour_number_id_here') {
    db.prepare(`
      INSERT INTO openphone_sync (last_sync_at, status, error_message, calls_synced, messages_synced)
      VALUES (datetime('now'), 'error', 'OPENPHONE_NUMBER_ID not configured in .env.local', 0, 0)
    `).run();
    return NextResponse.json({ error: 'Phone number ID not configured' }, { status: 400 });
  }

  // Load settings
  const settings = db.prepare('SELECT * FROM openphone_settings WHERE id = 1').get() as {
    sync_enabled: number;
    track_personal: number;
    personal_number: string;
  };

  if (!settings.sync_enabled) {
    return NextResponse.json({ message: 'Sync disabled' });
  }

  // Determine createdAfter from last successful sync
  const lastSync = db.prepare("SELECT last_sync_at FROM openphone_sync WHERE status = 'ok' ORDER BY id DESC LIMIT 1").get() as { last_sync_at: string } | undefined;
  const createdAfter = lastSync?.last_sync_at || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Default: last 24h

  try {
    const headers = { Authorization: apiKey };

    // Fetch calls
    const callsUrl = new URL('https://api.openphone.com/v1/calls');
    callsUrl.searchParams.set('phoneNumberId', phoneNumberId);
    callsUrl.searchParams.set('maxResults', '100');
    callsUrl.searchParams.set('createdAfter', createdAfter);

    const callsRes = await fetch(callsUrl.toString(), { headers });
    if (!callsRes.ok) {
      const errText = await callsRes.text();
      throw new Error(`Calls API error ${callsRes.status}: ${errText}`);
    }
    const callsData = await callsRes.json();
    const calls: OpenPhoneCall[] = callsData.data || [];

    // Fetch messages
    const msgsUrl = new URL('https://api.openphone.com/v1/messages');
    msgsUrl.searchParams.set('phoneNumberId', phoneNumberId);
    msgsUrl.searchParams.set('maxResults', '100');
    msgsUrl.searchParams.set('createdAfter', createdAfter);

    const msgsRes = await fetch(msgsUrl.toString(), { headers });
    if (!msgsRes.ok) {
      const errText = await msgsRes.text();
      throw new Error(`Messages API error ${msgsRes.status}: ${errText}`);
    }
    const msgsData = await msgsRes.json();
    const messages: OpenPhoneMessage[] = msgsData.data || [];

    // Load all contacts for phone matching
    const contacts = db.prepare('SELECT id, phone, name FROM contacts').all() as Contact[];

    const personalNorm = normalizePhone(settings.personal_number);
    let callsSynced = 0;
    let messagesSynced = 0;

    const insertLog = db.prepare(`
      INSERT INTO contact_log (contact_id, type, note, date, external_id, source)
      VALUES (@contact_id, @type, @note, @date, @external_id, 'openphone')
    `);
    const updateLastContact = db.prepare('UPDATE contacts SET last_contact = @date WHERE id = @id');
    const insertContact = db.prepare(`
      INSERT INTO contacts (deal_id, type, name, firm, phone, email, markets, warmth, last_contact, notes)
      VALUES (NULL, 'broker', @name, '', @phone, '', '', 'cool', @date, 'Auto-created from OpenPhone sync')
    `);
    const checkDupe = db.prepare('SELECT id FROM contact_log WHERE external_id = ?');

    const syncTxn = db.transaction(() => {
      // Process calls
      for (const call of calls) {
        if (checkDupe.get(call.id)) continue; // Already synced

        // Determine the other party's number
        const otherNumber = call.direction === 'incoming' ? call.from : call.to;
        if (!otherNumber) continue;

        // Skip personal number if tracking disabled
        if (!settings.track_personal && personalNorm && phonesMatch(otherNumber, settings.personal_number)) continue;

        const date = call.createdAt.split('T')[0];
        const durationMin = Math.round((call.duration || 0) / 60);
        const note = `${call.direction === 'incoming' ? 'Incoming' : 'Outgoing'} call — ${durationMin}m${call.status === 'completed' ? '' : ` (${call.status})`}`;

        // Find matching contact
        let contactId = findContactByPhone(contacts, otherNumber);
        if (!contactId) {
          const result = insertContact.run({ name: `Unknown (${otherNumber})`, phone: otherNumber, date });
          contactId = result.lastInsertRowid as number;
          contacts.push({ id: contactId, phone: otherNumber, name: `Unknown (${otherNumber})` });
        }

        insertLog.run({ contact_id: contactId, type: 'call', note, date, external_id: call.id });
        updateLastContact.run({ date, id: contactId });
        callsSynced++;
      }

      // Process messages
      for (const msg of messages) {
        if (checkDupe.get(msg.id)) continue;

        const otherNumber = msg.direction === 'incoming' ? msg.from : msg.to;
        if (!otherNumber) continue;

        if (!settings.track_personal && personalNorm && phonesMatch(otherNumber, settings.personal_number)) continue;

        const date = msg.createdAt.split('T')[0];
        const direction = msg.direction === 'incoming' ? 'Received' : 'Sent';
        const preview = msg.text ? (msg.text.length > 120 ? msg.text.slice(0, 120) + '...' : msg.text) : '(no text)';
        const note = `${direction} SMS: ${preview}`;

        let contactId = findContactByPhone(contacts, otherNumber);
        if (!contactId) {
          const result = insertContact.run({ name: `Unknown (${otherNumber})`, phone: otherNumber, date });
          contactId = result.lastInsertRowid as number;
          contacts.push({ id: contactId, phone: otherNumber, name: `Unknown (${otherNumber})` });
        }

        insertLog.run({ contact_id: contactId, type: 'sms', note, date, external_id: msg.id });
        updateLastContact.run({ date, id: contactId });
        messagesSynced++;
      }

      // Record sync
      db.prepare(`
        INSERT INTO openphone_sync (last_sync_at, status, error_message, calls_synced, messages_synced)
        VALUES (datetime('now'), 'ok', NULL, @calls, @msgs)
      `).run({ calls: callsSynced, msgs: messagesSynced });
    });

    syncTxn();

    return NextResponse.json({ callsSynced, messagesSynced });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    db.prepare(`
      INSERT INTO openphone_sync (last_sync_at, status, error_message, calls_synced, messages_synced)
      VALUES (datetime('now'), 'error', ?, 0, 0)
    `).run(message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function findContactByPhone(contacts: Contact[], phone: string): number | null {
  for (const c of contacts) {
    if (c.phone && phonesMatch(c.phone, phone)) return c.id;
  }
  return null;
}
