import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDB, cleanupTestDB } from '../utils/db.js';
import { MemoryService } from '../../src/services/memory.js';
import type { Database } from 'better-sqlite3';

describe('Memory E2E Workflow', () => {
  let db: Database.Database;
  let memoryService: MemoryService;
  const dataDir = './test/data';

  beforeEach(() => {
    db = setupTestDB();
    memoryService = new MemoryService(db, dataDir);
  });

  afterEach(() => {
    cleanupTestDB();
  });

  it('should save memory and retrieve it', async () => {
    // Save memory
    const result = await memoryService.saveMemory({
      content: 'React uses virtual DOM to optimize rendering',
      metadata: {
        tags: ['技术', '前端', 'React'],
        subjects: ['React'],
        keywords: ['virtual DOM', 'rendering'],
        importance: 0.8,
        summary: 'React rendering optimization'
      }
    });

    expect(result.id).toBeDefined();

    // Search memory
    const searchResults = await memoryService.searchMemory({
      query: 'React',
      limit: 10,
      timeRange: 'all'
    });

    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].contentPath).toBeDefined();
  });

  it('should get context for query', async () => {
    await memoryService.saveMemory({
      content: 'Use React.memo to prevent unnecessary re-renders'
    });

    const context = await memoryService.getContext({
      query: 'React optimization',
      maxTokens: 1000
    });

    expect(context).toBeDefined();
    expect(typeof context).toBe('string');
  });

  it('should get summary for period', async () => {
    await memoryService.saveMemory({
      content: 'Meeting: discuss project timeline'
    });

    const summary = await memoryService.getSummary('day');
    expect(summary).toBeDefined();
    expect(summary.date).toBeDefined();
  });
});
