# Claw-Memory OpenClaw 插件实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 开发 OpenClaw 插件，实现自动保存对话到记忆，会话开始时注入摘要

**Architecture:** 完全集成到 OpenClaw 插件系统，复用 claw-memory 现有服务（schema, summarizer, scheduler），使用 OpenClaw 内置 LLM

**Tech Stack:** TypeScript, OpenClaw Plugin SDK, better-sqlite3, node-cron

---

## 准备工作

### Task 1: 创建开发分支

**Step 1: 创建并切换到新分支**

```bash
cd /home/ubuntu/openclaw/claw-memory
git checkout -b feature/claw-memory-plugin
```

**Step 2: 验证分支**

```bash
git branch --show-current
```

Expected: `feature/claw-memory-plugin`

---

## Task 2: 创建插件项目结构

**Files:**
- Create: `plugin/openclaw.plugin.json`
- Create: `plugin/package.json`
- Create: `plugin/tsconfig.json`

**Step 1: 创建 openclaw.plugin.json**

```json
{
  "id": "claw-memory",
  "name": "ClawMemory",
  "version": "0.1.0",
  "description": "AI memory system - auto-save conversations and inject memory summary",
  "main": "./dist/index.js",
  "dependencies": {},
  "scripts": {
    "build": "tsc"
  }
}
```

**Step 2: 创建 package.json**

```json
{
  "name": "@openclaw/claw-memory",
  "version": "0.1.0",
  "description": "AI memory system for OpenClaw",
  "main": "dist/index.js",
  "type": "module",
  "scripts": {
    "build": "tsc"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "node-cron": "^4.2.1",
    "uuid": "^10.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0",
    "@types/node-cron": "^3.0.11",
    "@types/uuid": "^10.0.0",
    "typescript": "^5.0.0"
  }
}
```

**Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

**Step 4: 提交**

```bash
git add plugin/
git commit -m "feat: add OpenClaw plugin project structure"
```

---

## Task 3: 创建插件入口文件

**Files:**
- Create: `plugin/src/index.ts`

**Step 1: 创建插件入口**

```typescript
// plugin/src/index.ts
import type { OpenClawPlugin } from '@openclaw/plugin-sdk';

export default {
  name: 'claw-memory',
  version: '0.1.0',

  async register(context: any) {
    // 注册 Hooks
    await context.hooks.register('message:sent', async (event: any) => {
      const { message, session } = event;
      // TODO: 实现保存逻辑
    });

    await context.hooks.register('agent:bootstrap', async (context: any) => {
      // TODO: 实现注入摘要逻辑
    });

    // 注册 Agent Tools
    context.tools.register({
      name: 'memory_save',
      description: 'Save conversation to memory',
      schema: { /* ... */ },
      handler: async (params: any) => {
        // TODO: 实现保存工具
      }
    });

    // 初始化数据库
    // TODO: 初始化 SQLite

    // 启动定时任务
    // TODO: 启动 scheduler
  }
} satisfies OpenClawPlugin;
```

**Step 2: 提交**

```bash
git add plugin/src/index.ts
git commit -m "feat: add plugin entry point"
```

---

## Task 4: 实现配置管理

**Files:**
- Create: `plugin/src/config.ts`

**Step 1: 创建配置管理**

```typescript
// plugin/src/config.ts
export interface PluginConfig {
  enabled: boolean;
  autoSave: boolean;
  saveMode: 'qa' | 'full';
  dataDir: string;
  scheduler: {
    enabled: boolean;
    deduplicateTime: string;
    dailyTime: string;
    weeklyTime: string;
    monthlyTime: string;
  };
}

export function getConfig(context: any): PluginConfig {
  const defaultConfig: PluginConfig = {
    enabled: true,
    autoSave: true,
    saveMode: 'qa',
    dataDir: '~/.openclaw/claw-memory',
    scheduler: {
      enabled: true,
      deduplicateTime: '01:00',
      dailyTime: '02:00',
      weeklyTime: '03:00',
      monthlyTime: '04:00'
    }
  };

  const userConfig = context.config.get('plugins.claw-memory') || {};
  return { ...defaultConfig, ...userConfig };
}
```

**Step 2: 提交**

```bash
git add plugin/src/config.ts
git commit -m "feat: add config management"
```

---

## Task 5: 复用数据库 Schema

由于现有 `claw-memory/src/db/schema.ts` 已有完整的数据库 Schema，需要将其复制到插件中。

**Files:**
- Create: `plugin/src/db/schema.ts`

**Step 1: 复制 schema**

从 `src/db/schema.ts` 复制以下内容到 `plugin/src/db/schema.ts`:
- `initializeDatabase()` 函数
- `getDatabase()` 函数

**Step 2: 修改 getDatabase 路径**

```typescript
// plugin/src/db/schema.ts
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';

export function getDatabase(): Database.Database {
  const dataDir = process.env.CLAW_MEMORY_DATA_DIR || path.join(homedir(), '.openclaw', 'claw-memory');

  // 确保目录存在
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'memory.db');
  const db = new Database(dbPath);

  initializeDatabase(db);
  return db;
}
```

**Step 3: 提交**

```bash
git add plugin/src/db/
git commit -m "feat: add database schema"
```

---

## Task 6: 实现 message:sent Hook

**Files:**
- Create: `plugin/src/hooks/message.ts`

**Step 1: 创建 Hook 处理逻辑**

```typescript
// plugin/src/hooks/message.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

interface MessageEvent {
  message: {
    role: 'user' | 'assistant';
    content: string;
  };
  session: {
    id: string;
    key: string;
  };
}

export async function handleMessageSent(
  event: MessageEvent,
  db: Database,
  config: any
): Promise<void> {
  // 只处理 assistant 消息（AI 回复后保存）
  if (event.message.role !== 'assistant') {
    return;
  }

  // 获取对应的 user 消息（需要从 session 上下文中获取）
  // TODO: 从 session JSONL 中获取最后一条 user 消息

  const userMessage = event.message.content; // 临时：需要从上下文获取
  const assistantMessage = event.message.content;

  // 构建 Q&A
  const qaContent = `Q: ${userMessage}\nA: ${assistantMessage}`;

  // 保存到数据库
  const memoryId = uuidv4();
  const dataDir = process.env.CLAW_MEMORY_DATA_DIR || '~/.openclaw/claw-memory';
  const contentPath = `${dataDir}/memories/${memoryId}.md`;

  // 写入文件
  const fs = await import('fs/promises');
  await fs.writeFile(contentPath, qaContent);

  // 插入数据库
  db.prepare(`
    INSERT INTO memories (id, content_path, summary, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(memoryId, contentPath, assistantMessage.substring(0, 200));

  console.log(`[ClawMemory] Saved memory: ${memoryId}`);
}
```

**Step 2: 提交**

```bash
git add plugin/src/hooks/message.ts
git commit -m "feat: implement message:sent hook"
```

---

## Task 7: 实现 agent:bootstrap Hook

**Files:**
- Create: `plugin/src/hooks/bootstrap.ts`

**Step 1: 创建 Bootstrap Hook**

```typescript
// plugin/src/hooks/bootstrap.ts
import type { Database } from 'better-sqlite3';

export async function handleAgentBootstrap(
  context: any,
  db: Database
): Promise<string> {
  // 获取本周记忆摘要
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekStartStr = weekStart.toISOString().split('T')[0];

  const weekMemories = db.prepare(`
    SELECT summary, importance
    FROM memories
    WHERE date(created_at) >= date(?)
    ORDER BY importance DESC
    LIMIT 10
  `).all(weekStartStr) as { summary: string; importance: number }[];

  if (weekMemories.length === 0) {
    return '';
  }

  // 构建摘要文本
  const lines = ['## 记忆摘要\n'];
  lines.push(`本周共有 ${weekMemories.length} 条记忆记录。\n`);
  lines.push('### 重点内容:\n');

  for (const m of weekMemories.slice(0, 5)) {
    if (m.summary) {
      lines.push(`- ${m.summary}`);
    }
  }

  return lines.join('\n');
}
```

**Step 2: 提交**

```bash
git add plugin/src/hooks/bootstrap.ts
git commit -m "feat: implement agent:bootstrap hook"
```

---

## Task 8: 实现 Agent Tools

**Files:**
- Create: `plugin/src/tools/memory.ts`

**Step 1: 创建 memory_save 工具**

```typescript
// plugin/src/tools/memory.ts
import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export function registerMemoryTools(context: any, db: Database) {
  context.tools.register({
    name: 'memory_save',
    description: 'Save conversation to memory with metadata',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Conversation content' },
        metadata: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
            keywords: { type: 'array', items: { type: 'string' } },
            importance: { type: 'number', minimum: 0, maximum: 1 }
          }
        }
      },
      required: ['content']
    },
    handler: async (params: any) => {
      const { content, metadata = {} } = params;
      const memoryId = uuidv4();

      const dataDir = process.env.CLAW_MEMORY_DATA_DIR || '~/.openclaw/claw-memory';
      const contentPath = `${dataDir}/memories/${memoryId}.md`;

      const fs = await import('fs/promises');
      await fs.writeFile(contentPath, content);

      db.prepare(`
        INSERT INTO memories (id, content_path, summary, importance, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(memoryId, contentPath, metadata.summary || content.substring(0, 200), metadata.importance || 0.5);

      return { success: true, memory_id: memoryId };
    }
  });

  context.tools.register({
    name: 'memory_search',
    description: 'Search memories by query',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 10 }
      },
      required: ['query']
    },
    handler: async (params: any) => {
      const { query, limit = 10 } = params;
      const memories = db.prepare(`
        SELECT id, summary, importance, created_at
        FROM memories
        WHERE summary LIKE ?
        ORDER BY importance DESC
        LIMIT ?
      ).all(`%${query}%`, limit);

      return { memories };
    }
  });

  context.tools.register({
    name: 'memory_summary',
    description: 'Get memory summary for time period',
    schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['day', 'week', 'month'] },
        date: { type: 'string' }
      },
      required: ['period']
    },
    handler: async (params: any) => {
      const { period, date } = params;
      // 复用现有 summarizer 逻辑
      // TODO: 实现摘要获取
      return { summary: 'TODO' };
    }
  });
}
```

**Step 2: 提交**

```bash
git add plugin/src/tools/memory.ts
git commit -m "feat: register memory tools"
```

---

## Task 9: 复用 Scheduler 服务

由于现有 `claw-memory/src/services/scheduler.ts` 已有完整的 Scheduler，需要适配到插件中。

**Files:**
- Create: `plugin/src/services/scheduler.ts`

**Step 1: 复制并修改 Scheduler**

从 `src/services/scheduler.ts` 复制主要内容，并修改：
- 移除外部依赖（直接从插件上下文获取 db）
- 适配插件配置

**Step 2: 提交**

```bash
git add plugin/src/services/scheduler.ts
git commit -m "feat: add scheduler service"
```

---

## Task 10: 集成所有组件

**Files:**
- Modify: `plugin/src/index.ts`

**Step 1: 更新插件入口**

```typescript
// plugin/src/index.ts
import type { OpenClawPlugin } from '@openclaw/plugin-sdk';
import { getConfig, PluginConfig } from './config.js';
import { getDatabase } from './db/schema.js';
import { handleMessageSent } from './hooks/message.js';
import { handleAgentBootstrap } from './hooks/bootstrap.js';
import { registerMemoryTools } from './tools/memory.js';

export default {
  name: 'claw-memory',
  version: '0.1.0',

  async register(context: any) {
    const config = getConfig(context);
    if (!config.enabled) {
      console.log('[ClawMemory] Plugin disabled');
      return;
    }

    console.log('[ClawMemory] Starting...');

    // 初始化数据库
    const db = getDatabase();

    // 注册 Hooks
    await context.hooks.register('message:sent', async (event: any) => {
      if (config.autoSave) {
        try {
          await handleMessageSent(event, db, config);
        } catch (error) {
          console.error('[ClawMemory] Failed to save memory:', error);
        }
      }
    });

    await context.hooks.register('agent:bootstrap', async (bootstrapContext: any) => {
      try {
        const summary = await handleAgentBootstrap(bootstrapContext, db);
        if (summary) {
          bootstrapContext.context = bootstrapContext.context || '';
          bootstrapContext.context += '\n\n' + summary;
        }
      } catch (error) {
        console.error('[ClawMemory] Failed to inject summary:', error);
      }
    });

    // 注册 Tools
    registerMemoryTools(context, db);

    // 启动 Scheduler
    if (config.scheduler.enabled) {
      // TODO: 启动定时任务
    }

    console.log('[ClawMemory] Started successfully');
  }
} satisfies OpenClawPlugin;
```

**Step 2: 测试编译**

```bash
cd plugin
npm install
npm run build
```

**Step 3: 提交**

```bash
git add plugin/src/index.ts
git commit -m "feat: integrate all components"
```

---

## Task 11: 最终测试

**Step 1: 模拟安装测试**

由于需要 OpenClaw 环境，这里先验证代码能编译通过。

```bash
cd plugin
npm run build
ls -la dist/
```

Expected: 生成 dist/index.js 等文件

---

## Task 12: 合并到主分支

**Step 1: 切换到主分支**

```bash
git checkout main
```

**Step 2: 合并功能分支**

```bash
git merge feature/claw-memory-plugin
```

**Step 3: 推送到远程**

```bash
git push origin main
```

**Step 4: 删除功能分支（可选）**

```bash
git branch -d feature/claw-memory-plugin
```
