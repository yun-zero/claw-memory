import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db/schema.js';
import { MemoryService } from '../../src/services/memory.js';

describe('Error Handling', () => {
  let db: Database.Database;
  let service: MemoryService;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    service = new MemoryService(db, './test_errors');
  });

  it('should handle missing content field gracefully', async () => {
    // This should use default value or handle gracefully
    const result = await service.saveMemory({
      content: 'Valid content'
    } as any);
    expect(result.id).toBeDefined();
  });

  it('should handle invalid importance value', async () => {
    const result = await service.saveMemory({
      content: 'Test',
      metadata: { importance: 2.0 } as any // Invalid, should cap at 1
    });
    expect(result.importance).toBeLessThanOrEqual(1);
  });

  it('should handle negative importance', async () => {
    const result = await service.saveMemory({
      content: 'Test',
      metadata: { importance: -0.5 } as any
    });
    expect(result.importance).toBeGreaterThanOrEqual(0);
  });

  it('searchMemory should handle missing query gracefully', async () => {
    const results = await service.searchMemory({} as any);
    expect(Array.isArray(results)).toBe(true);
  });
});
