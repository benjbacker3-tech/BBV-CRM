import Database from 'better-sqlite3';

interface ActivityEntry {
  entity_type: 'deal' | 'contact' | 'task' | 'diligence' | 'investor';
  entity_id: number;
  action: string;
  description: string;
  metadata?: string;
}

export function logActivity(db: Database.Database, entry: ActivityEntry) {
  db.prepare(`
    INSERT INTO activity_log (entity_type, entity_id, action, description, metadata)
    VALUES (@entity_type, @entity_id, @action, @description, @metadata)
  `).run({
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    description: entry.description,
    metadata: entry.metadata || null,
  });
}
