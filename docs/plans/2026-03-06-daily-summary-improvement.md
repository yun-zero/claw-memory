# 日总结逻辑改进实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 每次日总结任务运行时，自动检查并补充从上次总结到昨天之间所有缺失的日总结

**Architecture:**
1. 新增 `getLastSummaryDate()` - 获取最后一次总结的日期
2. 新增 `getDatesBetween()` - 获取两个日期之间的所有日期
3. 修改 `dailySummary(date?)` - 支持指定日期参数，支持增量更新
4. 新增 `runDailySummaryTask()` - 主入口，检查并补充缺失日期

**Tech Stack:** TypeScript, better-sqlite3

---

## 任务清单

### Task 1: 添加辅助方法

**Files:**
- Modify: `src/services/scheduler.ts`

**Step 1: 添加 getLastSummaryDate 方法**

在 `formatSummariesForLLM` 方法之前添加：

```typescript
/**
 * 获取最后一次日总结的日期
 * @returns 最后总结日期字符串 (YYYY-MM-DD)，如果没有则返回 null
 */
private getLastSummaryDate(): string | null {
  const result = this.db.prepare(`
    SELECT date FROM time_buckets
    WHERE summary IS NOT NULL
    ORDER BY date DESC
    LIMIT 1
  `).get() as { date: string } | undefined;

  return result?.date || null;
}
```

**Step 2: 添加 getDatesBetween 方法**

在 `getLastSummaryDate` 方法之后添加：

```typescript
/**
 * 获取两个日期之间的所有日期（包含起始，不包含结束）
 * @param startDate - 起始日期 (YYYY-MM-DD)
 * @param endDate - 结束日期 (YYYY-MM-DD)，不包含
 * @returns 日期数组
 */
private getDatesBetween(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  const end = new Date(endDate);

  while (current < end) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}
```

**Step 3: 验证编译通过**

Run: `npm run build`
Expected: 无错误

---

### Task 2: 重构 dailySummary 支持指定日期和增量更新

**Files:**
- Modify: `src/services/scheduler.ts`

**Step 1: 替换现有的 dailySummary 方法**

```typescript
/**
 * 为指定日期生成日总结
 * @param targetDate - 目标日期 (YYYY-MM-DD)
 */
private async dailySummary(targetDate: string): Promise<void> {
  // 获取当天的记忆
  const memories = this.db.prepare(`
    SELECT id, summary, role, created_at
    FROM memories
    WHERE date(created_at) = date(?)
    ORDER BY created_at
  `).all(targetDate) as any[];

  if (memories.length === 0) {
    console.log(`[Scheduler] No memories for ${targetDate}, skipping`);
    return;
  }

  // 检查已有总结
  const existing = this.db.prepare(`
    SELECT summary, memory_count FROM time_buckets WHERE date = ?
  `).get(targetDate) as { summary?: string; memory_count?: number } | undefined;

  // 如果已有总结且记忆数量一致，跳过
  if (existing?.summary && existing.memory_count === memories.length) {
    console.log(`[Scheduler] Daily summary for ${targetDate} already up-to-date (${memories.length} memories)`);
    return;
  }

  // 有新记忆需要更新，或首次生成
  if (existing?.summary) {
    console.log(`[Scheduler] Updating daily summary for ${targetDate} (${existing.memory_count} -> ${memories.length} memories)`);
  } else {
    console.log(`[Scheduler] Generating daily summary for ${targetDate} (${memories.length} memories)`);
  }

  // 格式化内容
  const content = this.formatSummariesForLLM(memories);

  // 构建报告并调用 LLM
  const reportString = `日期: ${targetDate}\n记忆数量: ${memories.length}\n\n对话记录:\n${content}`;

  try {
    const summary = await generateSummaryWithLLM(reportString);

    // 保存到 time_buckets
    this.db.prepare(`
      INSERT OR REPLACE INTO time_buckets (date, summary, summary_generated_at, memory_count)
      VALUES (?, ?, datetime('now'), ?)
    `).run(targetDate, summary, memories.length);

    console.log(`[Scheduler] Daily summary saved for ${targetDate}`);
  } catch (error) {
    console.error(`[Scheduler] Failed to generate daily summary for ${targetDate}:`, error);
  }
}
```

**Step 2: 验证编译通过**

Run: `npm run build`
Expected: 无错误

---

### Task 3: 添加主入口方法 runDailySummaryTask

**Files:**
- Modify: `src/services/scheduler.ts`

**Step 1: 添加 runDailySummaryTask 方法**

在 `dailySummary` 方法之后添加：

```typescript
/**
 * 执行日总结任务 - 每次运行都检查并补充缺失的总结
 *
 * 逻辑：
 * 1. 获取最后一次总结的日期
 * 2. 从该日期 +1 天到昨天，检查每一天
 * 3. 如果有记忆但没有总结，生成总结
 */
private async runDailySummaryTask(): Promise<void> {
  console.log('[Scheduler] Running daily summary task...');

  // 获取昨天日期
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // 获取最后一次总结的日期
  const lastSummaryDate = this.getLastSummaryDate();

  // 确定起始日期：最后一次总结 +1 天，或者最早记忆的日期
  let startDate: string;
  if (lastSummaryDate) {
    const nextDay = new Date(lastSummaryDate);
    nextDay.setDate(nextDay.getDate() + 1);
    startDate = nextDay.toISOString().split('T')[0];
  } else {
    // 没有任何总结，从最早有记忆的日期开始
    const earliest = this.db.prepare(`
      SELECT date(created_at) as date FROM memories
      ORDER BY created_at ASC LIMIT 1
    `).get() as { date: string } | undefined;
    startDate = earliest?.date || yesterdayStr;
  }

  // 获取需要检查的日期列表
  const datesToCheck = this.getDatesBetween(startDate, yesterdayStr);

  if (datesToCheck.length === 0) {
    console.log('[Scheduler] No dates need summary');
    return;
  }

  console.log(`[Scheduler] Checking ${datesToCheck.length} dates for missing summaries (${startDate} to ${yesterdayStr})`);

  // 依次处理每个日期
  for (const date of datesToCheck) {
    // 检查该日期是否有记忆
    const memoryCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM memories WHERE date(created_at) = date(?)
    `).get(date) as { count: number };

    if (memoryCount.count === 0) {
      continue; // 没有记忆，跳过
    }

    // 检查是否已有总结
    const existing = this.db.prepare(`
      SELECT summary FROM time_buckets WHERE date = ?
    `).get(date) as { summary?: string } | undefined;

    if (existing?.summary) {
      // 已有总结，检查是否需要增量更新
      const summaryInfo = this.db.prepare(`
        SELECT memory_count FROM time_buckets WHERE date = ?
      `).get(date) as { memory_count: number } | undefined;

      if (summaryInfo && summaryInfo.memory_count === memoryCount.count) {
        continue; // 总结已是最新的
      }
    }

    // 需要生成或更新总结
    await this.dailySummary(date);
  }

  console.log('[Scheduler] Daily summary task completed');
}
```

**Step 2: 修改 processQueue 调用**

将 `case 'daily':` 中的 `this.dailySummary()` 改为 `this.runDailySummaryTask()`：

```typescript
case 'daily':
  await this.runDailySummaryTask();
  break;
```

**Step 3: 验证编译通过**

Run: `npm run build`
Expected: 无错误

---

### Task 4: 构建和发布

**Step 1: 构建项目**

Run: `npm run build`
Expected: 无错误

**Step 2: 提交代码**

```bash
git add src/services/scheduler.ts
git commit -m "feat: 日总结逻辑支持增量更新和历史补充

- 新增 getLastSummaryDate() 获取最后总结日期
- 新增 getDatesBetween() 获取日期区间
- 修改 dailySummary() 支持指定日期和增量更新
- 新增 runDailySummaryTask() 每次运行检查并补充缺失总结"
```

**Step 3: 更新版本并发布**

Run: `npm version patch -m "chore: release v%s" && git push && npm publish`
Expected: 发布成功

---

## 执行顺序

```
Task 1 (辅助方法) ──▶ Task 2 (dailySummary 重构) ──▶ Task 3 (runDailySummaryTask) ──▶ Task 4 (发布)
```

---

## 预期成果

| 场景 | 行为 |
|------|------|
| 定时任务 02:00 运行 | 检查上次总结到昨天之间所有缺失日期，依次补充 |
| 中断几天后恢复 | 自动补充中断期间所有缺失的日总结 |
| 当天有新对话 | 下次运行时检测到记忆数变化，重新生成总结 |
| 无新记忆 | 跳过，不做任何操作 |
