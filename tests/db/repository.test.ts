import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db/schema.js';
import { MemoryRepository } from '../../src/db/repository.js';

describe('MemoryRepository', () => {
  let db: Database.Database;
  let repo: MemoryRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    repo = new MemoryRepository(db);
  });

  describe('create', () => {
    it('should create a memory', () => {
      const memory = repo.create({
        contentPath: '/test/memory.md',
        summary: 'Test summary',
        importance: 0.8,
        tokenCount: 100
      });

      expect(memory.id).toBeDefined();
      expect(memory.summary).toBe('Test summary');
      expect(memory.importance).toBe(0.8);
    });

    it('should save and retrieve integrated summary', () => {
      const memory = repo.create({
        contentPath: '/test/path.md',
        summary: 'Test summary',
        integratedSummary: {
          active_areas: ['技术/AI (5)'],
          key_topics: ['React', 'OpenClaw'],
          recent_summary: '本周讨论了AI技术'
        }
      });

      const found = repo.findById(memory.id);
      expect(found.integratedSummary).toEqual({
        active_areas: ['技术/AI (5)'],
        key_topics: ['React', 'OpenClaw'],
        recent_summary: '本周讨论了AI技术'
      });
    });
  });

  describe('findById', () => {
    it('should find memory by id', () => {
      const created = repo.create({
        contentPath: '/test/memory.md',
        summary: 'Test summary',
        importance: 0.8
      });

      const found = repo.findById(created.id);
      expect(found).toBeDefined();
      expect(found?.summary).toBe('Test summary');
    });

    it('should return null for non-existent id', () => {
      const found = repo.findById('non-existent');
      expect(found).toBeNull();
    });
  });

  describe('findAll', () => {
    it('should return all memories', () => {
      repo.create({ contentPath: '/test/1.md', summary: 'Summary 1' });
      repo.create({ contentPath: '/test/2.md', summary: 'Summary 2' });

      const memories = repo.findAll();
      expect(memories.length).toBe(2);
    });
  });

  describe('delete', () => {
    it('should delete memory by id', () => {
      const created = repo.create({
        contentPath: '/test/memory.md',
        summary: 'Test'
      });

      const result = repo.delete(created.id);
      expect(result).toBe(true);

      const found = repo.findById(created.id);
      expect(found).toBeNull();
    });
  });
});
