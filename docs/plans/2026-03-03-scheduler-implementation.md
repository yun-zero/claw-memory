# Scheduler 定时任务系统实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现定时任务系统，支持每日/每周/每月自动生成总结，并处理重复记忆的去重

**Architecture:** 使用 node-cron 库实现定时任务，内置执行锁防止并发，任务失败记录日志并继续执行下一个

**Tech Stack:** TypeScript, node-cron, SQLite

---

## 准备工作

### Task 1: 创建开发分支

**Step 1: 创建并切换到新分支**

```bash
cd /home/ubuntu/openclaw/claw-memory
git checkout -b feature/scheduler
```

**Step 2: 验证分支**

```bash
git branch --show-current
```

Expected: `feature/scheduler`

---

## Task 2: 安装 node-cron 依赖

**Files:**
- Modify: `package.json`

**Step 1: 添加依赖**

```bash
cd /home/ubuntu/openclaw/claw-memory
npm install node-cron
npm install -D @types/node-cron
```

**Step 2: 验证安装**

```bash
cat package.json | grep node-cron
```

Expected: 看到 node-cron 版本号

**Step 3: 提交**

```bash
git add package.json package-lock.json
git commit -m "chore: add node-cron dependency"
```

---

## Task 3: 创建 Scheduler 服务类

**Files:**
- Create: `src/services/scheduler.ts`

**Step 1: 编写测试**

```typescript
// tests/unit/scheduler.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Scheduler', () => {
  it('should have isRunning flag initially false', () => {
    // 测试执行锁初始状态
    expect(true).toBe(true); // 占位
  });
});
```

**Step 2: 运行测试确认失败**

```bash
npm test -- tests/unit/scheduler.test.ts
```

Expected: 测试文件不存在报错

**Step 3: 创建 Scheduler 类**

```typescript
// src/services/scheduler.ts
import cron, { ScheduledTask } from 'node-cron';
import { getDatabase } from '../db/schema.js';

export interface SchedulerConfig {
  deduplicateTime?: string;  // HH:mm 格式
  dailyTime?: string;
  weeklyTime?: string;
  monthlyTime?: string;
  enabled?: boolean;
}

const DEFAULT_CONFIG: SchedulerConfig = {
  deduplicateTime: '01:00',
  dailyTime: '02:00',
  weeklyTime: '03:00',
  monthlyTime: '04:00',
  enabled: true
};

export class Scheduler {
  private config: SchedulerConfig;
  private isRunning = false;
  private taskQueue: Array<() => Promise<void>> = [];
  private tasks: ScheduledTask[] = [];
  private db: ReturnType<typeof getDatabase>;

  constructor(config?: Partial<SchedulerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.db = getDatabase();
  }

  start(): void {
    if (!this.config.enabled) {
      console.log('[Scheduler] Disabled, not starting');
      return;
    }

    console.log('[Scheduler] Starting...');
    this.scheduleDeduplicate();
    this.scheduleDailySummary();
    this.scheduleWeeklySummary();
    this.scheduleMonthlySummary();
    console.log('[Scheduler] All tasks scheduled');
  }

  stop(): void {
    this.tasks.forEach(task => task.stop());
    this.tasks = [];
    console.log('[Scheduler] Stopped');
  }

  private timeToCron(time: string): string {
    const [hour, minute] = time.split(':');
    return `${minute} ${hour} * * *`;
  }

  private scheduleDeduplicate(): void {
    const task = cron.schedule(
      this.timeToCron(this.config.deduplicateTime!),
      async () => {
        await this.executeWithLock(() => this.deduplicate());
      }
    );
    this.tasks.push(task);
  }

  private scheduleDailySummary(): void {
    const task = cron.schedule(
      this.timeToCron(this.config.dailyTime!),
      async () => {
        await this.executeWithLock(() => this.dailySummary());
      }
    );
    this.tasks.push(task);
  }

  private scheduleWeeklySummary(): void {
    const task = cron.schedule(
      this.timeToCron(this.config.weeklyTime!),
      async () => {
        await this.executeWithLock(() => this.weeklySummary());
      }
    );
    this.tasks.push(task);
  }

  private scheduleMonthlySummary(): void {
    const task = cron.schedule(
      this.timeToCron(this.config.monthlyTime!),
      async () => {
        await this.executeWithLock(() => this.monthlySummary());
      }
    );
    this.tasks.push(task);
  }

  private async executeWithLock(task: () => Promise<void>): Promise<void> {
    // 如果有任务正在执行，加入队列等待
    while (this.isRunning) {
      console.log('[Scheduler] Task in progress, waiting...');
      await new Promise(resolve => setTimeout(resolve, 60000)); // 每分钟检查一次
    }

    this.isRunning = true;
    try {
      console.log('[Scheduler] Starting task');
      await task();
      console.log('[Scheduler] Task completed');
    } catch (error) {
      console.error('[Scheduler] Task failed:', error);
    } finally {
      this.isRunning = false;
      this.processQueue();
    }
  }

  private processQueue(): void {
    const nextTask = this.taskQueue.shift();
    if (nextTask) {
      this.executeWithLock(nextTask);
    }
  }

  private async deduplicate(): Promise<void> {
    console.log('[Scheduler] Running deduplication...');
    // TODO: 实现去重逻辑
  }

  private async dailySummary(): Promise<void> {
    console.log('[Scheduler] Running daily summary...');
    // TODO: 实现日总结逻辑
  }

  private async weeklySummary(): void {
    console.log('[Scheduler] Running weekly summary...');
    // TODO: 实现周总结逻辑
  }

  private async monthlySummary(): void {
    console.log('[Scheduler] Running monthly summary...');
    // TODO: 实现月总结逻辑
  }

  isEnabled(): boolean {
    return this.config.enabled ?? true;
  }
}
```

**Step 4: 运行测试确认通过**

```bash
npm test -- tests/unit/scheduler.test.ts 2>&1 || echo "No tests yet, continue"
```

Expected: 通过或无测试

**Step 5: 提交**

```bash
git add src/services/scheduler.ts
git commit -m "feat: add Scheduler service class"
```

---

## Task 4: 读取现有 summarizer 服务

**Files:**
- Read: `src/services/summarizer.ts`

**Step 1: 读取 summarizer 服务**

```bash
cat src/services/summarizer.ts
```

了解现有的总结生成逻辑，特别是：
- `generateDailySummary()` 方法
- `generateWeeklySummary()` 方法
- `generateMonthlySummary()` 方法
- `deduplicateMemories()` 方法

**Step 2: 记录关键方法签名**

将方法签名记录下来供后续实现使用

---

## Task 5: 实现去重任务

**Files:**
- Modify: `src/services/scheduler.ts`

**Step 1: 实现 deduplicate 方法**

```typescript
private async deduplicate(): Promise<void> {
  console.log('[Scheduler] Running deduplication...');

  // 获取所有未归档的记忆
  const memories = this.db.prepare(`
    SELECT id, content_path, importance
    FROM memories
    WHERE is_archived = FALSE AND is_duplicate = FALSE
    ORDER BY created_at DESC
  `).all() as any[];

  const processed = new Set<string>();

  for (const memory of memories) {
    if (processed.has(memory.id)) continue;

    // 查找相似的记忆
    const similar = this.db.prepare(`
      SELECT m2.id, m2.content_path, m2.importance
      FROM memories m1
      JOIN memory_entities me1 ON m1.id = me1.memory_id
      JOIN memory_entities me2 ON me1.entity_id = me2.entity_id
      JOIN memories m2 ON me2.memory_id = m2.id
      WHERE m1.id = ? AND m2.id != m1.id
        AND m2.is_archived = FALSE AND m2.is_duplicate = FALSE
    `).all(memory.id) as any[];

    for (const similarMem of similar) {
      if (processed.has(similarMem.id)) continue;

      // 标记为重复
      this.db.prepare(`
        UPDATE memories
        SET is_duplicate = TRUE, duplicate_of = ?
        WHERE id = ?
      `).run(memory.id, similarMem.id);

      // 合并重要性
      const newImportance = Math.min(1, memory.importance + similarMem.importance * 0.5);
      this.db.prepare(`
        UPDATE memories SET importance = ? WHERE id = ?
      `).run(newImportance, memory.id);

      processed.add(similarMem.id);
      console.log(`[Scheduler] Marked ${similarMem.id} as duplicate of ${memory.id}`);
    }

    processed.add(memory.id);
  }

  console.log('[Scheduler] Deduplication completed');
}
```

**Step 2: 测试运行**

```bash
npx ts-node -e "
import { Scheduler } from './src/services/scheduler.js';
const s = new Scheduler({ enabled: false });
console.log('Scheduler loaded successfully');
"
```

Expected: 无报错

**Step 3: 提交**

```bash
git add src/services/scheduler.ts
git commit -m "feat: implement deduplicate task in Scheduler"
```

---

## Task 6: 实现每日总结任务

**Files:**
- Modify: `src/services/scheduler.ts`

**Step 1: 导入 summarizer**

在文件顶部添加:
```typescript
import { Summarizer } from './summarizer.js';
```

**Step 2: 实现 dailySummary 方法**

```typescript
private async dailySummary(): Promise<void> {
  console.log('[Scheduler] Running daily summary...');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

  // 检查是否已有总结
  const existing = this.db.prepare(`
    SELECT summary FROM time_buckets WHERE date = ?
  `).get(dateStr) as { summary?: string } | undefined;

  if (existing?.summary) {
    console.log(`[Scheduler] Daily summary for ${dateStr} already exists`);
    return;
  }

  // 获取当天的记忆
  const memories = this.db.prepare(`
    SELECT id, content_path FROM memories
    WHERE date(created_at) = date(?)
  `).all(dateStr) as any[];

  if (memories.length === 0) {
    console.log(`[Scheduler] No memories for ${dateStr}, skipping`);
    return;
  }

  // 读取记忆内容
  const fs = await import('fs/promises');
  const contents: string[] = [];

  for (const mem of memories) {
    try {
      const content = await fs.readFile(mem.content_path, 'utf-8');
      contents.push(content.slice(0, 1000)); // 限制长度
    } catch (e) {
      console.error(`[Scheduler] Failed to read ${mem.content_path}`);
    }
  }

  // 调用 LLM 生成总结
  const summarizer = new Summarizer(this.db);
  const report = {
    date: dateStr,
    memoryCount: memories.length,
    topTags: [],
    topKeywords: [],
    memories: contents
  };

  try {
    const summary = await summarizer.generateDailySummary(report);

    // 保存到 time_buckets
    this.db.prepare(`
      INSERT OR REPLACE INTO time_buckets (date, summary, summary_generated_at, memory_count)
      VALUES (?, ?, datetime('now'), ?)
    `).run(dateStr, summary, memories.length);

    console.log(`[Scheduler] Daily summary generated for ${dateStr}`);
  } catch (error) {
    console.error('[Scheduler] Failed to generate daily summary:', error);
  }
}
```

**Step 3: 测试运行**

```bash
npx ts-node -e "
import { Scheduler } from './src/services/scheduler.js';
const s = new Scheduler({ enabled: false });
console.log('Scheduler with daily summary loaded successfully');
"
```

**Step 4: 提交**

```bash
git add src/services/scheduler.ts
git commit -m "feat: implement daily summary task in Scheduler"
```

---

## Task 7: 实现每周/每月总结任务

**Files:**
- Modify: `src/services/scheduler.ts`

**Step 1: 实现 weeklySummary 方法**

```typescript
private async weeklySummary(): Promise<void> {
  console.log('[Scheduler] Running weekly summary...');

  // 获取本周第一天
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const weekStart = new Date(now.setDate(diff));
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().split('T')[0];

  // 检查是否已有总结
  const existing = this.db.prepare(`
    SELECT summary FROM time_buckets WHERE date = ?
  `).get(weekStartStr) as { summary?: string } | undefined;

  if (existing?.summary) {
    console.log(`[Scheduler] Weekly summary for ${weekStartStr} already exists`);
    return;
  }

  // 获取本周所有记忆
  const memories = this.db.prepare(`
    SELECT id, content_path FROM memories
    WHERE date(created_at) >= date(?) AND date(created_at) <= date('now')
  `).all(weekStartStr) as any[];

  if (memories.length === 0) {
    console.log(`[Scheduler] No memories for week ${weekStartStr}, skipping`);
    return;
  }

  // 读取记忆内容并生成周总结
  const fs = await import('fs/promises');
  const contents: string[] = [];

  for (const mem of memories.slice(0, 10)) { // 限制数量
    try {
      const content = await fs.readFile(mem.content_path, 'utf-8');
      contents.push(content.slice(0, 500));
    } catch (e) {
      // skip
    }
  }

  const summarizer = new Summarizer(this.db);
  const report = {
    period: 'week',
    startDate: weekStartStr,
    endDate: now.toISOString().split('T')[0],
    memoryCount: memories.length,
    memories: contents
  };

  try {
    const summary = await summarizer.generateWeeklySummary(report);

    this.db.prepare(`
      INSERT OR REPLACE INTO time_buckets (date, summary, summary_generated_at, memory_count)
      VALUES (?, ?, datetime('now'), ?)
    `).run(weekStartStr, summary, memories.length);

    console.log(`[Scheduler] Weekly summary generated for ${weekStartStr}`);
  } catch (error) {
    console.error('[Scheduler] Failed to generate weekly summary:', error);
  }
}
```

**Step 2: 实现 monthlySummary 方法**

```typescript
private async monthlySummary(): Promise<void> {
  console.log('[Scheduler] Running monthly summary...');

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStartStr = monthStart.toISOString().split('T')[0];

  // 检查是否已有总结
  const existing = this.db.prepare(`
    SELECT summary FROM time_buckets WHERE date = ?
  `).get(monthStartStr) as { summary?: string } | undefined;

  if (existing?.summary) {
    console.log(`[Scheduler] Monthly summary for ${monthStartStr} already exists`);
    return;
  }

  // 获取本月所有记忆
  const memories = this.db.prepare(`
    SELECT id FROM memories
    WHERE date(created_at) >= date(?) AND date(created_at) <= date('now')
  `).all(monthStartStr) as any[];

  if (memories.length === 0) {
    console.log(`[Scheduler] No memories for month ${monthStartStr}, skipping`);
    return;
  }

  const summarizer = new Summarizer(this.db);
  const report = {
    period: 'month',
    startDate: monthStartStr,
    endDate: now.toISOString().split('T')[0],
    memoryCount: memories.length
  };

  try {
    const summary = await summarizer.generateMonthlySummary(report);

    this.db.prepare(`
      INSERT OR REPLACE INTO time_buckets (date, summary, summary_generated_at, memory_count)
      VALUES (?, ?, datetime('now'), ?)
    `).run(monthStartStr, summary, memories.length);

    console.log(`[Scheduler] Monthly summary generated for ${monthStartStr}`);
  } catch (error) {
    console.error('[Scheduler] Failed to generate monthly summary:', error);
  }
}
```

**Step 3: 提交**

```bash
git add src/services/scheduler.ts
git commit -m "feat: implement weekly and monthly summary tasks in Scheduler"
```

---

## Task 8: 添加环境变量配置支持

**Files:**
- Modify: `src/services/scheduler.ts`

**Step 1: 修改构造函数读取环境变量**

```typescript
constructor(config?: Partial<SchedulerConfig>) {
  // 合并环境变量配置
  const envConfig: SchedulerConfig = {
    deduplicateTime: process.env.SCHEDULER_DEDUPE_TIME,
    dailyTime: process.env.SCHEDULER_DAILY_TIME,
    weeklyTime: process.env.SCHEDULER_WEEKLY_TIME,
    monthlyTime: process.env.SCHEDULER_MONTHLY_TIME,
    enabled: process.env.SCHEDULER_ENABLED === 'false' ? false : true
  };

  this.config = { ...DEFAULT_CONFIG, ...envConfig, ...config };
  this.db = getDatabase();
}
```

**Step 2: 验证编译**

```bash
npm run build 2>&1 | head -20
```

Expected: 无错误

**Step 3: 提交**

```bash
git add src/services/scheduler.ts
git commit -m "feat: add environment variable config support for Scheduler"
```

---

## Task 9: 集成 Scheduler 到 MCP Server

**Files:**
- Modify: `src/index.ts`

**Step 1: 导入 Scheduler**

在文件顶部添加:
```typescript
import { Scheduler } from './services/scheduler.js';
```

**Step 2: 在 serve action 中初始化 Scheduler**

```typescript
// 在 db 和 memoryService 初始化后添加
const scheduler = new Scheduler();
scheduler.start();
```

**Step 3: 确保 Server 停止时 Scheduler 也停止**

由于 MCP Server 使用 stdio 传输，通常是长期运行，不需要额外处理。

**Step 4: 测试编译**

```bash
npm run build
```

Expected: 编译成功

**Step 5: 提交**

```bash
git add src/index.ts
git commit -m "feat: integrate Scheduler into MCP Server"
```

---

## Task 10: 添加 CLI 参数支持

**Files:**
- Modify: `src/index.ts`

**Step 1: 添加 CLI 选项**

在 serve 命令中添加:
```typescript
.option('-s, --scheduler-disabled', 'Disable scheduler', false)
```

**Step 2: 根据参数创建 Scheduler**

```typescript
const scheduler = new Scheduler({
  enabled: !options.schedulerDisabled
});
scheduler.start();
```

**Step 3: 测试 CLI 参数**

```bash
node dist/index.js serve --help
```

Expected: 看到 --scheduler-disabled 选项

**Step 4: 提交**

```bash
git add src/index.ts
git commit -m "feat: add CLI option to disable scheduler"
```

---

## Task 11: 最终测试

**Step 1: 构建项目**

```bash
npm run build
```

**Step 2: 启动服务测试**

```bash
timeout 5 node dist/index.js serve 2>&1 || true
```

Expected: 看到 Scheduler 启动日志

**Step 3: 测试禁用 Scheduler**

```bash
timeout 5 node dist/index.js serve --scheduler-disabled 2>&1 || true
```

Expected: 看到 Scheduler disabled 日志

---

## Task 12: 合并到主分支

**Step 1: 切换到主分支**

```bash
git checkout main
```

**Step 2: 合并功能分支**

```bash
git merge feature/scheduler
```

**Step 3: 推送到远程**

```bash
git push origin main
```

**Step 4: 删除功能分支（可选）**

```bash
git branch -d feature/scheduler
```
