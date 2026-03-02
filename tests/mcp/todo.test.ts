import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db/schema.js';
import { createAddTodoTool, createListTodosTool, createCompleteTodoTool } from '../../src/mcp/tools.js';

describe('Todo MCP Tools', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
  });

  it('should add todo', async () => {
    const addTool = createAddTodoTool(db);
    const result = await addTool.handler({ content: '新任务', period: 'week', periodDate: '2026-03-02' });
    expect(result.id).toBeDefined();
  });

  it('should list todos', async () => {
    const addTool = createAddTodoTool(db);
    const listTool = createListTodosTool(db);

    await addTool.handler({ content: '任务1', period: 'week', periodDate: '2026-03-02' });
    await addTool.handler({ content: '任务2', period: 'week', periodDate: '2026-03-02' });

    const result = await listTool.handler({ period: 'week', periodDate: '2026-03-02' });
    expect(result.todos.length).toBe(2);
  });

  it('should complete todo', async () => {
    const addTool = createAddTodoTool(db);
    const completeTool = createCompleteTodoTool(db);

    const created = await addTool.handler({ content: '任务', period: 'day', periodDate: '2026-03-02' });
    await completeTool.handler({ id: created.id });

    const listTool = createListTodosTool(db);
    const result = await listTool.handler({ period: 'day', periodDate: '2026-03-02', includeCompleted: true });
    expect(result.todos[0].completedAt).toBeDefined();
  });
});
