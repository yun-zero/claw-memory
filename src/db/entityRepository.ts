import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Entity } from '../types.js';

export interface CreateEntityInput {
  name: string;
  type: Entity['type'];
  parentId?: string | null;
  level?: number;
  metadata?: Record<string, unknown>;
}

export class EntityRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: CreateEntityInput): Entity {
    const id = uuidv4();
    const now = new Date();

    this.db.prepare(`
      INSERT INTO entities (id, name, type, parent_id, level, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.name,
      input.type,
      input.parentId || null,
      input.level ?? 0,
      input.metadata ? JSON.stringify(input.metadata) : null,
      now.toISOString()
    );

    return this.findById(id)!;
  }

  findById(id: string): Entity | null {
    const row = this.db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as any;
    if (!row) return null;
    return this.mapRowToEntity(row);
  }

  findByName(name: string): Entity | null {
    const row = this.db.prepare('SELECT * FROM entities WHERE name = ?').get(name) as any;
    if (!row) return null;
    return this.mapRowToEntity(row);
  }

  findByType(type: Entity['type']): Entity[] {
    const rows = this.db.prepare('SELECT * FROM entities WHERE type = ?').all(type) as any[];
    return rows.map(row => this.mapRowToEntity(row));
  }

  findChildren(parentId: string): Entity[] {
    const rows = this.db.prepare('SELECT * FROM entities WHERE parent_id = ?').all(parentId) as any[];
    return rows.map(row => this.mapRowToEntity(row));
  }

  findOrCreate(input: CreateEntityInput): Entity {
    const existing = this.findByName(input.name);
    if (existing) return existing;
    return this.create(input);
  }

  private mapRowToEntity(row: any): Entity {
    return {
      id: row.id,
      name: row.name,
      type: row.type as Entity['type'],
      parentId: row.parent_id,
      level: row.level,
      metadata: row.metadata ? JSON.parse(row.metadata) : null,
      createdAt: new Date(row.created_at)
    };
  }
}
