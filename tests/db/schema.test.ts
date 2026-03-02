import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase, getDatabase } from '../../src/db/schema.js';

describe('Database Schema', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
  });

  it('should create memories table', () => {
    const result = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='memories'
    `).get();
    expect(result).toBeDefined();
  });

  it('should create entities table', () => {
    const result = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='entities'
    `).get();
    expect(result).toBeDefined();
  });

  it('should create memory_entities table', () => {
    const result = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='memory_entities'
    `).get();
    expect(result).toBeDefined();
  });

  it('should create entity_relations table', () => {
    const result = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='entity_relations'
    `).get();
    expect(result).toBeDefined();
  });

  it('should create time_buckets table', () => {
    const result = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='time_buckets'
    `).get();
    expect(result).toBeDefined();
  });

  it('should create todos table', () => {
    const result = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='todos'
    `).get();
    expect(result).toBeDefined();
  });

  it('should create required indexes', () => {
    const indexes = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='index'
    `).all();
    expect(indexes.length).toBeGreaterThan(0);
  });
});
