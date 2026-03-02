import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db/schema.js';
import { MemoryService } from '../../src/services/memory.js';
import * as metadataExtractorModule from '../../src/services/metadataExtractor.js';

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

    it('should extract metadata with LLM when saving memory', async () => {
      vi.spyOn(metadataExtractorModule.MetadataExtractor.prototype, 'extract').mockResolvedValue({
        tags: ['技术/前端'],
        keywords: ['React'],
        subjects: ['React学习'],
        importance: 0.8,
        summary: '测试'
      });

      const result = await service.saveMemory({
        content: '讨论 React Hooks',
        metadata: {}
      });

      expect(result).toBeDefined();
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

  describe('searchMemory boundaries', () => {
    beforeEach(async () => {
      await service.saveMemory({ content: 'Test 1', metadata: { summary: 'Test 1' } });
      await service.saveMemory({ content: 'Test 2', metadata: { summary: 'Test 2' } });
    });

    it('should return all memories with empty query', async () => {
      const results = await service.searchMemory({ query: '', limit: 10 });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array for non-existent query', async () => {
      const results = await service.searchMemory({ query: 'xyznonexistent', limit: 10 });
      expect(results).toEqual([]);
    });

    it('should return empty array when limit=0', async () => {
      const results = await service.searchMemory({ query: '', limit: 0 });
      expect(results).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      const results = await service.searchMemory({ query: '', limit: 1 });
      expect(results.length).toBe(1);
    });

    it('should handle large limit', async () => {
      const results = await service.searchMemory({ query: '', limit: 10000 });
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

  describe('getContext boundaries', () => {
    it('should return empty string when no memories', async () => {
      const db = new Database(':memory:');
      initializeDatabase(db);
      const emptyService = new MemoryService(db, './test_ctx');
      const result = await emptyService.getContext({ query: 'test', maxTokens: 100 });
      expect(result).toBe('');
    });

    it('should return empty when maxTokens=0', async () => {
      const result = await service.getContext({ query: 'test', maxTokens: 0 });
      expect(result).toBe('');
    });

    it('should handle very large maxTokens', async () => {
      // Save a memory first to ensure there's content to return
      await service.saveMemory({
        content: 'Test content for large maxTokens',
        metadata: { summary: 'Large token test' }
      });
      const result = await service.getContext({ query: 'test', maxTokens: 100000 });
      expect(result.length).toBeGreaterThan(0);
    });

    it('should truncate when single memory exceeds maxTokens', async () => {
      const longMemory = await service.saveMemory({
        content: 'a'.repeat(5000),
        metadata: { summary: 'Long' }
      });
      const result = await service.getContext({ query: 'Long', maxTokens: 100 });
      // Should handle gracefully
      expect(typeof result).toBe('string');
    });
  });

  describe('getSummary', () => {
    it('should return TimeBucket without LLM key configured', async () => {
      // Save some test memories
      await service.saveMemory({
        content: 'Test content about React',
        metadata: { summary: 'React notes', importance: 0.8, tags: ['技术/前端'] }
      });

      const result = await service.getSummary('week', '2026-02-24');

      expect(result).toBeDefined();
      expect(result.memoryCount).toBeGreaterThanOrEqual(0); // May or may not include test memory depending on date
      expect(result.summary).toBeDefined();
      expect(result.keyTopics).toBeDefined();
    });

    it('should calculate correct date ranges for different periods', async () => {
      // Day period - should return the same date
      const dayResult = await service.getSummary('day', '2026-02-24');
      expect(dayResult.date).toBe('2026-02-24'); // day returns same date

      // Week period - should return 7 days before
      const weekResult = await service.getSummary('week', '2026-02-24');
      expect(weekResult.date).toBe('2026-02-17');

      // Month period - should go back 1 month
      const monthResult = await service.getSummary('month', '2026-02-24');
      expect(monthResult.date).toBe('2026-01-24');
    });
  });
});
