# ClawMemory LLM 增强设计

**日期**: 2026-03-06
**版本**: 1.0
**状态**: 已批准

---

## 背景

经过数据库分析，发现以下核心问题：

1. **去重误判严重** - 基于共享实体判断，导致不相关记忆被标记为重复
2. **总结功能失效** - 依赖 `content_path` 读取文件，但旧数据该字段为空
3. **LLM 使用低级** - 只用于元数据提取，未用于语义判断

## 目标

- 用 LLM 语义判断替代共享实体去重
- 直接使用 `summary` 字段生成总结，不依赖文件系统
- 提升记忆系统整体质量

---

## 架构变更

```
┌─────────────────────────────────────────────────────────────┐
│                    新增服务层                                │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              LlmDeduplicator (新增)                  │   │
│  │                                                      │   │
│  │  - checkDuplicate(mem1, mem2): Promise<Result>      │   │
│  │  - batchCheck(pairs, concurrency): Promise<Map>     │   │
│  │  - buildPrompt(): 构建去重判断 prompt               │   │
│  │  - parseResponse(): 解析 LLM 返回                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Summarizer (修改)                       │   │
│  │                                                      │   │
│  │  变更:                                               │   │
│  │  - 移除 fs.readFile(content_path) 依赖              │   │
│  │  - 直接从 memories.summary 读取                      │   │
│  │  - 新增 formatSummariesForLLM() 方法                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Scheduler (修改)                        │   │
│  │                                                      │   │
│  │  变更:                                               │   │
│  │  - deduplicate() 调用 LlmDeduplicator               │   │
│  │  - dailySummary() 使用新 Summarizer 逻辑            │   │
│  │  - weeklySummary() 使用新 Summarizer 逻辑           │   │
│  │  - monthlySummary() 使用新 Summarizer 逻辑          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 详细设计

### 1. LLM 语义去重服务 (LlmDeduplicator)

**文件**: `src/services/llmDeduplicator.ts`

```typescript
export interface DeduplicationResult {
  isDuplicate: boolean;
  reason: string;
  confidence: number;  // 0-1
}

export interface MemoryPair {
  id: string;
  summary: string;
  role: string;
  createdAt: Date;
}

export class LlmDeduplicator {
  /**
   * 判断两条记忆是否语义重复
   */
  async checkDuplicate(mem1: MemoryPair, mem2: MemoryPair): Promise<DeduplicationResult> {
    const prompt = this.buildPrompt(mem1, mem2);
    const response = await generateSummaryWithLLM(prompt);
    return this.parseResponse(response);
  }

  /**
   * 批量检查候选对（带并发控制）
   * @param pairs 候选对数组
   * @param concurrency 并发数，默认 3
   */
  async batchCheck(
    pairs: [MemoryPair, MemoryPair][],
    concurrency: number = 3
  ): Promise<Map<string, DeduplicationResult>> {
    const results = new Map<string, DeduplicationResult>();

    // 分批处理，避免 API 限流
    for (let i = 0; i < pairs.length; i += concurrency) {
      const batch = pairs.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async ([mem1, mem2]) => {
          const key = `${mem1.id}:${mem2.id}`;
          try {
            const result = await this.checkDuplicate(mem1, mem2);
            return [key, result] as [string, DeduplicationResult];
          } catch (error) {
            // 失败时默认不重复（保守策略）
            return [key, { isDuplicate: false, reason: 'LLM 调用失败', confidence: 0 }] as [string, DeduplicationResult];
          }
        })
      );
      batchResults.forEach(([key, result]) => results.set(key, result));
    }

    return results;
  }

  /**
   * 构建去重判断 prompt
   */
  private buildPrompt(mem1: MemoryPair, mem2: MemoryPair): string {
    return `你是一个记忆去重专家。判断以下两条记忆是否语义重复。

【记忆 A】
角色: ${mem1.role}
内容: ${mem1.summary}
时间: ${mem1.createdAt.toISOString()}

【记忆 B】
角色: ${mem2.role}
内容: ${mem2.summary}
时间: ${mem2.createdAt.toISOString()}

判断标准：
- 完全相同或高度相似的提问/回答 → 重复
- 同一话题的不同方面 → 不重复
- 后续追问 vs 独立问题 → 不重复
- AI 对不同问题的回答 → 不重复

返回 JSON 格式（只返回 JSON，不要其他内容）：
{"isDuplicate": boolean, "confidence": 0.0-1.0, "reason": "判断理由"}`;
  }

  /**
   * 解析 LLM 返回
   */
  private parseResponse(response: string): DeduplicationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isDuplicate: parsed.isDuplicate === true,
          reason: parsed.reason || '',
          confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5))
        };
      }
    } catch (error) {
      console.warn('[LlmDeduplicator] Failed to parse response:', error);
    }

    // 默认不重复
    return { isDuplicate: false, reason: '解析失败', confidence: 0 };
  }
}
```

### 2. 去重流程改造

**文件**: `src/services/scheduler.ts`

**变更点**: `deduplicate()` 方法

```typescript
private async deduplicate(): Promise<void> {
  console.log('[Scheduler] Running LLM-based deduplication...');

  // Step 1: 规则筛选候选对
  const candidates = this.findDuplicateCandidates();

  if (candidates.length === 0) {
    console.log('[Scheduler] No duplicate candidates found');
    return;
  }

  console.log(`[Scheduler] Found ${candidates.length} candidate pairs`);

  // Step 2: LLM 语义确认
  const deduplicator = new LlmDeduplicator();
  const results = await deduplicator.batchCheck(candidates);

  // Step 3: 更新数据库
  let duplicateCount = 0;
  for (const [key, result] of results) {
    if (result.isDuplicate && result.confidence > 0.8) {
      const [mem1Id, mem2Id] = key.split(':');

      // 保留较早的记忆，标记较晚的为重复
      this.db.prepare(`
        UPDATE memories
        SET is_duplicate = TRUE, duplicate_of = ?
        WHERE id = ?
      `).run(mem1Id, mem2Id);

      // 合并重要性
      this.db.prepare(`
        UPDATE memories SET importance = MIN(1, importance + 0.1)
        WHERE id = ?
      `).run(mem1Id);

      duplicateCount++;
      console.log(`[Scheduler] Marked ${mem2Id} as duplicate of ${mem1Id}: ${result.reason}`);
    }
  }

  console.log(`[Scheduler] Deduplication completed: ${duplicateCount} duplicates marked`);
}

/**
 * 规则筛选候选对
 */
private findDuplicateCandidates(): [MemoryPair, MemoryPair][] {
  const candidates: [MemoryPair, MemoryPair][] = [];
  const processed = new Set<string>();

  // 获取所有非归档、非重复的记忆
  const memories = this.db.prepare(`
    SELECT id, summary, role, created_at
    FROM memories
    WHERE is_archived = FALSE AND is_duplicate = FALSE
    ORDER BY created_at DESC
  `).all() as MemoryPair[];

  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      const mem1 = memories[i];
      const mem2 = memories[j];
      const key = `${mem1.id}:${mem2.id}`;

      if (processed.has(key)) continue;

      // 规则 1: 共享实体数 >= 2
      const sharedEntities = this.db.prepare(`
        SELECT COUNT(DISTINCT me1.entity_id) as count
        FROM memory_entities me1
        JOIN memory_entities me2 ON me1.entity_id = me2.entity_id
        WHERE me1.memory_id = ? AND me2.memory_id = ?
      `).get(mem1.id, mem2.id) as { count: number };

      if (sharedEntities.count >= 2) {
        candidates.push([
          { ...mem1, createdAt: new Date(mem1.created_at) },
          { ...mem2, createdAt: new Date(mem2.created_at) }
        ]);
        processed.add(key);
        continue;
      }

      // 规则 2: 同一天 + 同一角色 + 摘要相似 (简化版: 包含相同关键词)
      const sameDay = mem1.created_at.split('T')[0] === mem2.created_at.split('T')[0];
      const sameRole = mem1.role === mem2.role;

      if (sameDay && sameRole) {
        const words1 = new Set(mem1.summary?.split(/\s+/) || []);
        const words2 = new Set(mem2.summary?.split(/\s+/) || []);
        const intersection = [...words1].filter(w => words2.has(w) && w.length > 2);

        if (intersection.length >= 3) {
          candidates.push([
            { ...mem1, createdAt: new Date(mem1.created_at) },
            { ...mem2, createdAt: new Date(mem2.created_at) }
          ]);
          processed.add(key);
        }
      }
    }
  }

  return candidates;
}
```

### 3. 总结逻辑改造

**文件**: `src/services/scheduler.ts`

**变更点**: `dailySummary()`, `weeklySummary()`, `monthlySummary()` 方法

```typescript
/**
 * 格式化记忆摘要供 LLM 使用
 */
private formatSummariesForLLM(memories: { summary: string; role: string; created_at: string }[]): string {
  return memories.map(m => {
    const time = new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    return `[${time}] [${m.role}] ${m.summary || '(无摘要)'}`;
  }).join('\n');
}

/**
 * 日总结任务
 */
private async dailySummary(): Promise<void> {
  console.log('[Scheduler] Running daily summary...');

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const dateStr = yesterday.toISOString().split('T')[0];

  // 检查是否已有总结
  const existing = this.db.prepare(`
    SELECT summary FROM time_buckets WHERE date = ?
  `).get(dateStr) as { summary?: string } | undefined;

  if (existing?.summary) {
    console.log(`[Scheduler] Daily summary for ${dateStr} already exists`);
    return;
  }

  // 获取当天的记忆 (直接使用 summary 字段)
  const memories = this.db.prepare(`
    SELECT id, summary, role, created_at
    FROM memories
    WHERE date(created_at) = date(?)
    ORDER BY created_at
  `).all(dateStr) as any[];

  if (memories.length === 0) {
    console.log(`[Scheduler] No memories for ${dateStr}, skipping`);
    return;
  }

  // 格式化内容
  const content = this.formatSummariesForLLM(memories);

  // 构建报告并调用 LLM
  const reportString = `日期: ${dateStr}\n记忆数量: ${memories.length}\n\n对话记录:\n${content}`;

  try {
    const summary = await generateSummaryWithLLM(reportString);

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

/**
 * 周总结任务
 */
private async weeklySummary(): Promise<void> {
  console.log('[Scheduler] Running weekly summary...');

  const now = new Date();
  const dayOfWeek = now.getDay();
  const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const weekStart = new Date(now.getFullYear(), now.getMonth(), diff);
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

  // 获取本周记忆 (直接使用 summary 字段)
  const memories = this.db.prepare(`
    SELECT id, summary, role, created_at
    FROM memories
    WHERE date(created_at) >= date(?) AND date(created_at) <= date('now')
    ORDER BY created_at
  `).all(weekStartStr) as any[];

  if (memories.length === 0) {
    console.log(`[Scheduler] No memories for week ${weekStartStr}, skipping`);
    return;
  }

  // 格式化内容
  const content = this.formatSummariesForLLM(memories.slice(0, 50)); // 限制数量

  const reportString = `周期: 本周 (${weekStartStr} 至今)\n记忆数量: ${memories.length}\n\n对话记录:\n${content}`;

  try {
    const summary = await generateSummaryWithLLM(reportString);

    this.db.prepare(`
      INSERT OR REPLACE INTO time_buckets (date, summary, summary_generated_at, memory_count)
      VALUES (?, ?, datetime('now'), ?)
    `).run(weekStartStr, summary, memories.length);

    console.log(`[Scheduler] Weekly summary generated for ${weekStartStr}`);
  } catch (error) {
    console.error('[Scheduler] Failed to generate weekly summary:', error);
  }
}

/**
 * 月总结任务
 */
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

  // 获取本月记忆 (直接使用 summary 字段)
  const memories = this.db.prepare(`
    SELECT id, summary, role, created_at
    FROM memories
    WHERE date(created_at) >= date(?) AND date(created_at) <= date('now')
    ORDER BY created_at
  `).all(monthStartStr) as any[];

  if (memories.length === 0) {
    console.log(`[Scheduler] No memories for month ${monthStartStr}, skipping`);
    return;
  }

  // 格式化内容 (月总结限制更多)
  const content = this.formatSummariesForLLM(memories.slice(0, 100));

  const reportString = `周期: 本月 (${monthStartStr} 至今)\n记忆数量: ${memories.length}\n\n对话记录:\n${content}`;

  try {
    const summary = await generateSummaryWithLLM(reportString);

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

---

## 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/services/llmDeduplicator.ts` | **新增** | LLM 语义去重服务 |
| `src/services/scheduler.ts` | **修改** | 去重和总结逻辑改造 |

---

## 成本估算

假设每天新增 100 条记忆：

| 任务 | LLM 调用次数 | 备注 |
|------|-------------|------|
| 去重 | ~30-50 次/天 | 候选对筛选后 |
| 日总结 | 1 次/天 | |
| 周总结 | 1 次/周 | |
| 月总结 | 1 次/月 | |

**总计**: ~35-55 次 LLM 调用/天

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| LLM API 限流 | 并发控制 (3)，失败重试 |
| LLM 调用失败 | 保守策略：默认不标记重复 |
| 成本过高 | 候选对筛选减少调用次数 |
| 总结内容过长 | 限制记忆数量 (50-100条) |

---

## 测试计划

1. **单元测试**
   - `LlmDeduplicator.checkDuplicate()` 返回解析
   - `LlmDeduplicator.batchCheck()` 并发控制

2. **集成测试**
   - 去重流程端到端测试
   - 总结流程端到端测试

3. **手动验证**
   - 运行去重任务，检查标记结果
   - 运行总结任务，检查生成内容
