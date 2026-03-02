import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db/schema.js';
import { EntityRepository } from '../../src/db/entityRepository.js';

describe('EntityRepository', () => {
  let db: Database.Database;
  let repo: EntityRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    repo = new EntityRepository(db);
  });

  describe('create', () => {
    it('should create an entity', () => {
      const entity = repo.create({
        name: 'React',
        type: 'tag',
        parentId: null,
        level: 0
      });

      expect(entity.id).toBeDefined();
      expect(entity.name).toBe('React');
      expect(entity.type).toBe('tag');
    });
  });

  describe('findByName', () => {
    it('should find entity by name', () => {
      repo.create({ name: 'React', type: 'tag' });

      const found = repo.findByName('React');
      expect(found).toBeDefined();
      expect(found?.name).toBe('React');
    });
  });

  describe('findByType', () => {
    it('should find entities by type', () => {
      repo.create({ name: 'React', type: 'tag' });
      repo.create({ name: 'Vue', type: 'tag' });
      repo.create({ name: 'John', type: 'person' });

      const tags = repo.findByType('tag');
      expect(tags.length).toBe(2);
    });
  });

  describe('findChildren', () => {
    it('should find child entities', () => {
      const parent = repo.create({ name: '前端', type: 'tag', level: 0 });
      repo.create({ name: 'React', type: 'tag', parentId: parent.id, level: 1 });

      const children = repo.findChildren(parent.id);
      expect(children.length).toBe(1);
    });
  });
});
