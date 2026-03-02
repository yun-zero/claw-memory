# 记忆索引与自动提取功能实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 LLM 自动提取元数据、记忆索引 API、待办事项功能，支持 OpenClaw Hook 在对话开始时获取记忆摘要

**Architecture:** 分三个阶段实现：1) LLM 自动提取元数据 2) 记忆索引 API 3) 待办事项功能。每个阶段使用 TDD，先写测试再实现。

**Tech Stack:** TypeScript, better-sqlite3, LLM API (OpenAI/Anthropic)

---

## 阶段一：LLM 自动提取元数据

### Task 1: 创建 MetadataExtractor 服务

**Files:**
- Create: `src/services/metadataExtractor.ts`
- Modify: `src/services/memory.ts`
- Test: `tests/services/metadataExtractor.test.ts`

**Step 1: 编写失败的测试**

```typescript
// tests/services/metadataExtractor.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetadataExtractor } from '../../src/services/metadataExtractor.js';

describe('MetadataExtractor', () => {
  let extractor: MetadataExtractor;

  beforeEach(() => {
    extractor = new MetadataExtractor();
  });

  it('should extract metadata from content', async () => {
    const content = '用户讨论了 React Hooks 的使用，包括 useState 和 useEffect';
    const result = await extractor.extract(content);

    expect(result).toHaveProperty('tags');
    expect(result).toHaveProperty('keywords');
    expect(result).toHaveProperty('subjects');
    expect(result).toHaveProperty('importance');
    expect(result).toHaveProperty('summary');
  });
});
```

**Step 2: 运行测试验证失败**

```bash
npm test tests/services/metadataExtractor.test.ts
```
Expected: FAIL - MetadataExtractor not found

**Step 3: 最小实现**

```typescript
// src/services/metadataExtractor.ts
export interface ExtractedMetadata {
  tags: string[];
  keywords: string[];
  subjects: string[];
  importance: number;
  summary: string;
}

export class MetadataExtractor {
  async extract(content: string): Promise<ExtractedMetadata> {
    // TODO: 实现 LLM 提取逻辑
    return {
      tags: [],
      keywords: [],
      subjects: [],
      importance: 0.5,
      summary: ''
    };
  }
}
```

**Step 4: 运行测试验证通过**

```bash
npm test tests/services/metadataExtractor.test.ts
```
Expected: PASS

**Step 5: 提交**

```bash
git add src/services/metadataExtractor.ts tests/services/metadataExtractor.test.ts
git commit -m "feat: add MetadataExtractor service stub"
```

---

### Task 2: 集成 LLM 提取逻辑

**Files:**
- Modify: `src/services/metadataExtractor.ts:15-60`
- Test: `tests/services/metadataExtractor.test.ts`

**Step 1: 更新测试添加 LLM 模拟**

```typescript
// 在 metadataExtractor.test.ts 添加
it('should call LLM and parse response', async () => {
  const mockLLMResponse = {
    tags: ['技术/前端/React'],
    keywords: ['useState', 'useEffect'],
    subjects: ['React Hooks'],
    importance: 0.8,
    summary: '讨论 React Hooks 使用'
  };

  // Mock LLM call
  vi.spyOn(extractor, 'callLLM').mockResolvedValue(mockLLMResponse);

  const result = await extractor.extract('讨论 React Hooks');
  expect(result.tags).toContain('技术/前端/React');
});
```

**Step 2: 运行测试**

```bash
npm test tests/services/metadataExtractor.test.ts
```
Expected: FAIL - callLLM not implemented

**Step 3: 实现 LLM 提取**

```typescript
// src/services/metadataExtractor.ts 完整实现
import { generateSummaryWithLLM } from '../config/llm.js';

const EXTRACTION_PROMPT = `请从以下对话内容中提取结构化元数据：

内容：{content}

请以 JSON 格式返回：
{
  "tags": ["一级分类/二级分类/三级分类"],
  "keywords": ["关键词1", "关键词2"],
  "subjects": ["主题1", "主题2"],
  "importance": 0.0-1.0,
  "summary": "一句话摘要"
}

注意：
- tags 使用层级结构，如 "技术/前端/React"
- importance 表示内容重要性，0.0-1.0
- 只返回 JSON，不要其他内容`;

export class MetadataExtractor {
  async extract(content: string): Promise<ExtractedMetadata> {
    const prompt = EXTRACTION_PROMPT.replace('{content}', content);

    try {
      const response = await generateSummaryWithLLM(prompt);
      return this.parseLLMResponse(response);
    } catch (error) {
      console.warn('LLM extraction failed:', error);
      return this.fallbackExtract(content);
    }
  }

  private parseLLMResponse(response: string): ExtractedMetadata {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {}
    return this.fallbackExtract('');
  }

  private fallbackExtract(content: string): ExtractedMetadata {
    return {
      tags: [],
      keywords: [],
      subjects: [],
      importance: 0.5,
      summary: content.substring(0, 100)
    };
  }
}
```

**Step 4: 运行测试**

```bash
npm test tests/services/metadataExtractor.test.ts
```
Expected: PASS

**Step 5: 提交**

```bash
git add src/services/metadataExtractor.ts
git commit -m "feat: implement LLM metadata extraction"
```

---

### Task 3: 修改 MemoryService 集成提取

**Files:**
- Modify: `src/services/memory.ts:28-50`
- Test: `tests/services/memory.test.ts`

**Step 1: 添加集成测试**

```typescript
// tests/services/memory.test.ts 添加
it('should extract metadata with LLM when saving memory', async () => {
  vi.spyOn(extractor, 'extract').mockResolvedValue({
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
```

**Step 2: 运行测试**

```bash
npm test tests/services/memory.test.ts
```
Expected: FAIL - extractor not integrated

**Step 3: 修改 MemoryService**

```typescript
// src/services/memory.ts 导入
import { MetadataExtractor } from './metadataExtractor.js';

export class MemoryService {
  private extractor: MetadataExtractor;

  constructor(...) {
    // ... existing code
    this.extractor = new MetadataExtractor();
  }

  async saveMemory(input: SaveMemoryInput): Promise<Memory> {
    // 调用 LLM 提取元数据
    const extracted = await this.extractor.extract(input.content);

    // 合并：LLM 提取的覆盖用户传入的
    const metadata = {
      tags: extracted.tags,
      keywords: extracted.keywords,
      subjects: extracted.subjects,
      importance: extracted.importance,
      summary: extracted.summary
    };

    // ... 后续处理不变
  }
}
```

**Step 4: 运行测试**

```bash
npm test tests/services/memory.test.ts
```
Expected: PASS

**Step 5: 提交**

```bash
git add src/services/memory.ts tests/services/memory.test.ts
git commit -m "feat: integrate LLM metadata extraction in saveMemory"
```

---

## 阶段二：记忆索引 API

### Task 4: 添加 todos 表 schema

**Files:**
- Modify: `src/db/schema.ts:69-85`
- Test: `tests/db/schema.test.ts`

**Step 1: 编写失败的测试**

```typescript
// tests/db/schema.test.ts 添加
it('should create todos table', () => {
  const stmt = db.prepare(`
    SELECT name FROM sqlite_master WHERE type='table' AND name='todos'
  `);
  const result = stmt.get();
  expect(result).toBeDefined();
});
```

**Step 2: 运行测试**

```bash
npm test tests/db/schema.test.ts
```
Expected: FAIL - todos table not found

**Step 3: 添加 schema**

```typescript
// src/db/schema.ts 添加
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    period TEXT NOT NULL,
    period_date TEXT,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    memory_id TEXT
  )
`);
```

**Step 4: 运行测试**

```bash
npm test tests/db/schema.test.ts
```
Expected: PASS

**Step 5: 提交**

```bash
git add src/db/schema.ts
git commit -m "feat: add todos table schema"
```

---

### Task 5: 创建 TodoRepository

**Files:**
- Create: `src/db/todoRepository.ts`
- Test: `tests/db/todoRepository.test.ts`

**Step 1: 编写测试**

```typescript
// tests/db/todoRepository.test.ts
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
```

**Step 2: 运行测试**

```bash
npm test tests/db/todoRepository.test.ts
```
Expected: FAIL - TodoRepository not found

**Step 3: 实现 TodoRepository**

```typescript
// src/db/todoRepository.ts
import { v4 as uuidv4 } from 'uuid';

export interface Todo {
  id: string;
  content: string;
  period: 'day' | 'week' | 'month';
  periodDate: string;
  createdAt: Date;
  completedAt: Date | null;
  memoryId: string | null;
}

export interface CreateTodoInput {
  content: string;
  period: 'day' | 'week' | 'month';
  periodDate: string;
  memoryId?: string;
}

export class TodoRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateTodoInput): Todo {
    const id = uuidv4();
    const createdAt = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO todos (id, content, period, period_date, created_at, memory_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.content, input.period, input.periodDate, createdAt, input.memoryId || null);

    return { id, content: input.content, period: input.period, periodDate: input.periodDate, createdAt: new Date(createdAt), completedAt: null, memoryId: input.memoryId || null };
  }

  findByPeriod(period: string, periodDate: string): Todo[] {
    return this.db.prepare(`
      SELECT * FROM todos WHERE period = ? AND period_date = ?
      ORDER BY created_at DESC
    `).all(period, periodDate) as Todo[];
  }

  findById(id: string): Todo | null {
    return this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as Todo | null;
  }

  markCompleted(id: string): void {
    this.db.prepare(`
      UPDATE todos SET completed_at = ? WHERE id = ?
    `).run(new Date().toISOString(), id);
  }
}
```

**Step 4: 运行测试**

```bash
npm test tests/db/todoRepository.test.ts
```
Expected: PASS

**Step 5: 提交**

```bash
git add src/db/todoRepository.ts tests/db/todoRepository.test.ts
git commit -m "feat: add TodoRepository for todo management"
```

---

### Task 6: 创建 get_memory_index MCP 工具

**Files:**
- Modify: `src/mcp/tools.ts`
- Create: `src/services/memoryIndex.ts`
- Test: `tests/mcp/memoryIndex.test.ts`

**Step 1: 编写测试**

```typescript
// tests/mcp/memoryIndex.test.ts
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
    // 创建测试数据...

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
});
```

**Step 2: 运行测试**

```bash
npm test tests/mcp/memoryIndex.test.ts
```
Expected: FAIL - getMemoryIndex not found

**Step 3: 实现 memoryIndex 服务**

```typescript
// src/services/memoryIndex.ts
import { TodoRepository } from '../db/todoRepository.js';
import { MemoryRepository } from '../db/repository.js';
import { EntityRepository } from '../db/entityRepository.js';

export interface MemoryIndexOptions {
  period: 'day' | 'week' | 'month';
  date?: string;
  includeTodos?: boolean;
  includeRecent?: boolean;
  recentLimit?: number;
}

export interface MemoryIndex {
  period: { start: string; end: string };
  activeAreas: {
    tags: { name: string; count: number }[];
    keywords: string[];
  };
  todos: { id: string; content: string; period: string }[];
  recentActivity: { date: string; summary: string }[];
}

export async function getMemoryIndex(db: Database.Database, options: MemoryIndexOptions): Promise<MemoryIndex> {
  const { startDate, endDate } = calculatePeriodRange(options.period, options.date);

  // 获取活跃领域
  const tagRepo = new EntityRepository(db);
  const tags = getTopTags(db, startDate, endDate, 10);
  const keywords = getTopKeywords(db, startDate, endDate, 10);

  // 获取待办
  const todoRepo = new TodoRepository(db);
  const todos = options.includeTodos
    ? todoRepo.findByPeriod(options.period, endDate).filter(t => !t.completedAt)
    : [];

  // 获取最近动态
  const memoryRepo = new MemoryRepository(db);
  const recentMemories = options.includeRecent
    ? memoryRepo.findByDateRange(startDate, endDate, options.recentLimit || 5)
    : [];

  return {
    period: { start: startDate, end: endDate },
    activeAreas: { tags, keywords },
    todos: todos.map(t => ({ id: t.id, content: t.content, period: t.period })),
    recentActivity: recentMemories.map(m => ({
      date: m.createdAt.toISOString().split('T')[0],
      summary: m.summary || ''
    }))
  };
}

function calculatePeriodRange(period: string, date?: string) {
  const endDate = date || new Date().toISOString().split('T')[0];
  const startDate = new Date(endDate);

  switch (period) {
    case 'day': break;
    case 'week': startDate.setDate(startDate.getDate() - 7); break;
    case 'month': startDate.setMonth(startDate.getMonth() - 1); break;
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate
  };
}

function getTopTags(db: Database.Database, startDate: string, endDate: string, limit: number) {
  return db.prepare(`
    SELECT e.name, COUNT(me.memory_id) as count
    FROM memory_entities me
    JOIN entities e ON me.entity_id = e.id
    JOIN memories m ON me.memory_id = m.id
    WHERE e.type = 'tag' AND date(m.created_at) BETWEEN ? AND ?
    GROUP BY e.id ORDER BY count DESC LIMIT ?
  `).all(startDate, endDate, limit) as { name: string; count: number }[];
}

function getTopKeywords(db: Database.Database, startDate: string, endDate: string, limit: number) {
  const rows = db.prepare(`
    SELECT e.name FROM memory_entities me
    JOIN entities e ON me.entity_id = e.id
    JOIN memories m ON me.memory_id = m.id
    WHERE e.type = 'keyword' AND date(m.created_at) BETWEEN ? AND ?
    GROUP BY e.id ORDER BY COUNT(*) DESC LIMIT ?
  `).all(startDate, endDate, limit) as { name: string }[];
  return rows.map(r => r.name);
}
```

**Step 4: 添加 MCP 工具**

```typescript
// src/mcp/tools.ts 添加
import { getMemoryIndex } from '../services/memoryIndex.js';

export function createGetMemoryIndexTool(db: Database.Database): MCPTool {
  return {
    name: 'get_memory_index',
    description: 'Get memory index summary for conversation context',
    inputSchema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['day', 'week', 'month'],
          default: 'week'
        },
        date: { type: 'string' },
        includeTodos: { type: 'boolean', default: true },
        includeRecent: { type: 'boolean', default: true },
        recentLimit: { type: 'number', default: 5 }
      }
    },
    handler: async (params) => {
      return await getMemoryIndex(db, params);
    }
  };
}
```

**Step 5: 运行测试**

```bash
npm test tests/mcp/memoryIndex.test.ts
```
Expected: PASS

**Step 6: 提交**

```bash
git add src/services/memoryIndex.ts src/mcp/tools.ts tests/mcp/memoryIndex.test.ts
git commit -m "feat: add get_memory_index MCP tool"
```

---

## 阶段三：待办事项 MCP 工具

### Task 7: 添加待办事项 MCP 工具

**Files:**
- Modify: `src/mcp/tools.ts`
- Test: `tests/mcp/todo.test.ts`

**Step 1: 编写测试**

```typescript
// tests/mcp/todo.test.ts
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
    const result = await listTool.handler({ period: 'day', periodDate: '2026-03-02' });
    expect(result.todos[0].completedAt).toBeDefined();
  });
});
```

**Step 2: 运行测试**

```bash
npm test tests/mcp/todo.test.ts
```
Expected: FAIL - tools not implemented

**Step 3: 实现工具**

```typescript
// src/mcp/tools.ts 添加
import { TodoRepository, CreateTodoInput } from '../db/todoRepository.js';

export function createAddTodoTool(db: Database.Database): MCPTool {
  return {
    name: 'add_todo',
    description: 'Add a todo item',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string' },
        period: { type: 'string', enum: ['day', 'week', 'month'] },
        periodDate: { type: 'string' },
        memoryId: { type: 'string' }
      },
      required: ['content', 'period', 'periodDate']
    },
    handler: async (params) => {
      const repo = new TodoRepository(db);
      const todo = repo.create(params as CreateTodoInput);
      return todo;
    }
  };
}

export function createListTodosTool(db: Database.Database): MCPTool {
  return {
    name: 'list_todos',
    description: 'List todo items',
    inputSchema: {
      type: 'object' as const,
      properties: {
        period: { type: 'string', enum: ['day', 'week', 'month'] },
        periodDate: { type: 'string' },
        includeCompleted: { type: 'boolean', default: false }
      },
      required: ['period', 'periodDate']
    },
    handler: async (params) => {
      const repo = new TodoRepository(db);
      let todos = repo.findByPeriod(params.period, params.periodDate);
      if (!params.includeCompleted) {
        todos = todos.filter(t => !t.completedAt);
      }
      return { todos };
    }
  };
}

export function createCompleteTodoTool(db: Database.Database): MCPTool {
  return {
    name: 'complete_todo',
    description: 'Mark a todo as completed',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    handler: async (params) => {
      const repo = new TodoRepository(db);
      repo.markCompleted(params.id);
      return { success: true };
    }
  };
}
```

**Step 4: 运行测试**

```bash
npm test tests/mcp/todo.test.ts
```
Expected: PASS

**Step 5: 提交**

```bash
git add src/mcp/tools.ts tests/mcp/todo.test.ts
git commit -m "feat: add todo MCP tools (add_todo, list_todos, complete_todo)"
```

---

## 总结

完成所有任务后，运行完整测试：

```bash
npm test
```

预期：所有测试通过

---
