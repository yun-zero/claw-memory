import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db/schema.js';
import { TodoRepository } from '../../src/db/todoRepository.js';

describe('TodoRepository', () => {
  let db: Database.Database;
  let repo: TodoRepository;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    repo = new TodoRepository(db);
  });

  it('should create a todo', () => {
    const todo = repo.create({
      content: '完成某事',
      period: 'week',
      periodDate: '2026-03-02'
    });
    expect(todo.id).toBeDefined();
    expect(todo.content).toBe('完成某事');
  });

  it('should list todos by period', () => {
    repo.create({ content: '任务1', period: 'week', periodDate: '2026-03-02' });
    repo.create({ content: '任务2', period: 'week', periodDate: '2026-03-02' });

    const todos = repo.findByPeriod('week', '2026-03-02');
    expect(todos.length).toBe(2);
  });

  it('should mark todo as completed', () => {
    const todo = repo.create({ content: '任务', period: 'day', periodDate: '2026-03-02' });
    repo.markCompleted(todo.id);

    const updated = repo.findById(todo.id);
    expect(updated.completedAt).toBeDefined();
  });
});
