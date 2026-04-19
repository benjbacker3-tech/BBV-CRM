import { run } from './db';

interface ActivityEntry {
  entity_type: 'deal' | 'contact' | 'task' | 'diligence' | 'investor';
  entity_id: number;
  action: string;
  description: string;
  metadata?: string;
}

export async function logActivity(entry: ActivityEntry): Promise<void> {
  await run(
    `INSERT INTO activity_log (entity_type, entity_id, action, description, metadata) VALUES (?, ?, ?, ?, ?)`,
    [entry.entity_type, entry.entity_id, entry.action, entry.description, entry.metadata || null]
  );
}
