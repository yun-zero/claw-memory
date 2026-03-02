import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db/schema.js';
import { getMemoryIndex } from '../../src/services/memoryIndex.js';

describe('getMemoryIndex', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
  });

  it('should return memory index with all sections', async () => {
    const result = await getMemoryIndex(db, {
      period: 'week',
      includeTodos: true,
      includeRecent: true
    });

    expect(result).toHaveProperty('period');
    expect(result).toHaveProperty('activeAreas');
    expect(result).toHaveProperty('todos');
    expect(result).toHaveProperty('recentActivity');
  });

  it('should calculate correct period range for week', async () => {
    const result = await getMemoryIndex(db, {
      period: 'week',
      date: '2026-03-02'
    });

    expect(result.period.end).toBe('2026-03-02');
    expect(result.period.start).toBe('2026-02-23'); // 7 days before
  });

  it('should calculate correct period range for month', async () => {
    const result = await getMemoryIndex(db, {
      period: 'month',
      date: '2026-03-02'
    });

    expect(result.period.end).toBe('2026-03-02');
    expect(result.period.start).toBe('2026-02-02'); // 1 month before
  });
});
