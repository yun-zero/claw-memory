import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import type { Memory, IntegratedSummary } from '../types.js';

export interface CreateMemoryInput {
  contentPath: string;
  summary?: string;
  integratedSummary?: IntegratedSummary;
  importance?: number;
  tokenCount?: number;
}

export class MemoryRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(input: CreateMemoryInput): Memory {
    const id = uuidv4();
    const now = new Date();

    this.db.prepare(`
      INSERT INTO memories (id, content_path, summary, integrated_summary, importance, token_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      input.contentPath,
      input.summary || null,
      input.integratedSummary ? JSON.stringify(input.integratedSummary) : null,
      input.importance ?? 0.5,
      input.tokenCount ?? 0,
      now.toISOString(),
      now.toISOString()
    );

    return this.findById(id)!;
  }

  findById(id: string): Memory | null {
    const row = this.db.prepare(`
      SELECT * FROM memories WHERE id = ?
    `).get(id) as any;

    if (!row) return null;
    return this.mapRowToMemory(row);
  }

  findAll(limit?: number, offset?: number): Memory[] {
    let query = 'SELECT * FROM memories ORDER BY created_at DESC';
    if (limit) {
      query += ` LIMIT ${limit}`;
      if (offset) query += ` OFFSET ${offset}`;
    }

    const rows = this.db.prepare(query).all() as any[];
    return rows.map(row => this.mapRowToMemory(row));
  }

  delete(id: string): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  updateLastAccessed(id: string): void {
    this.db.prepare(`
      UPDATE memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?
    `).run(new Date().toISOString(), id);
  }

  private mapRowToMemory(row: any): Memory {
    return {
      id: row.id,
      contentPath: row.content_path,
      summary: row.summary,
      integratedSummary: row.integrated_summary ? this.safeParseJSON(row.integrated_summary) : null,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      tokenCount: row.token_count,
      importance: row.importance,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : null,
      isArchived: Boolean(row.is_archived),
      isDuplicate: Boolean(row.is_duplicate),
      duplicateOf: row.duplicate_of
    };
  }

  private safeParseJSON(json: string): IntegratedSummary | null {
    try {
      return JSON.parse(json);
    } catch {
      return null;
    }
  }

  getLatestIntegratedSummary(): IntegratedSummary | null {
    const row = this.db.prepare(`
      SELECT integrated_summary FROM memories ORDER BY created_at DESC LIMIT 1
    `).get() as { integrated_summary: string } | undefined;

    if (!row || !row.integrated_summary) return null;
    return this.safeParseJSON(row.integrated_summary);
  }
}
