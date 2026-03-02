import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db/schema.js';
import { MemoryService } from '../../src/services/memory.js';

describe('MemoryService', () => {
  let db: Database.Database;
  let service: MemoryService;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    service = new MemoryService(db, './test_memories');
  });

  describe('saveMemory', () => {
    it('should save memory with metadata', async () => {
      const input = {
        content: 'Test content about React hooks',
        metadata: {
          tags: ['技术/前端/React'],
          subjects: ['React Hooks'],
          keywords: ['useState', 'useEffect'],
          importance: 0.8,
          summary: '讨论 React Hooks'
        }
      };

      const result = await service.saveMemory(input);
      expect(result.id).toBeDefined();
      expect(result.summary).toBe('讨论 React Hooks');
    });

    it('should save memory with empty content', async () => {
      const result = await service.saveMemory({
        content: '',
        metadata: { summary: 'Empty content test' }
      });
      expect(result.id).toBeDefined();
    });

    it('should save memory without metadata', async () => {
      const result = await service.saveMemory({
        content: 'Test content only'
      });
      expect(result.id).toBeDefined();
      expect(result.importance).toBe(0.5); // default
    });

    it('should save memory with custom importance=1.0', async () => {
      const result = await service.saveMemory({
        content: 'High importance',
        metadata: { importance: 1.0 }
      });
      expect(result.importance).toBe(1.0);
    });

    it('should save memory with custom importance=0', async () => {
      const result = await service.saveMemory({
        content: 'Zero importance',
        metadata: { importance: 0 }
      });
      expect(result.importance).toBe(0);
    });

    it('should save memory with long content', async () => {
      const longContent = 'a'.repeat(10000);
      const result = await service.saveMemory({
        content: longContent,
        metadata: { summary: 'Long content' }
      });
      expect(result.id).toBeDefined();
      expect(result.tokenCount).toBeGreaterThan(0);
    });
  });

  describe('searchMemory', () => {
    it('should search memories', async () => {
      // 先保存一条记忆
      await service.saveMemory({
        content: 'Test content',
        metadata: { summary: 'Test' }
      });

      const results = await service.searchMemory({
        query: 'Test',
        limit: 10
      });

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getContext', () => {
    it('should get context within token limit', async () => {
      await service.saveMemory({
        content: 'Content 1',
        metadata: { summary: 'Summary 1', importance: 0.9 }
      });

      const context = await service.getContext({
        query: 'test',
        maxTokens: 1000
      });

      expect(context).toBeDefined();
    });
  });
});
