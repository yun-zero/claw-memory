# LLM 增强功能实现计划

**基于设计文档**: `docs/plans/2026-03-06-llm-enhancement-design.md`
**创建日期**: 2026-03-06

---

## 概述

实现两个核心功能增强：
1. **LLM 语义去重** - 用 LLM 语义判断替代共享实体判断
2. **总结逻辑改造** - 直接使用 summary 字段，不依赖 content_path

---

## 技术栈

- TypeScript 5.0+
- Node.js 18+
- Vitest 测试框架
- better-sqlite3

---

## 任务清单

### Task 1: 创建 LlmDeduplicator 服务

**目标**: 新增 LLM 语义去重服务

**文件:**
- Create: `src/services/llmDeduplicator.ts`
- Test: `tests/services/llmDeduplicator.test.ts`

**实现步骤:**

1. 创建 `src/services/llmDeduplicator.ts` 文件

2. 定义接口和类型:
```typescript
export interface DeduplicationResult {
  isDuplicate: boolean;
  reason: string;
  confidence: number;
}

export interface MemoryPair {
  id: string;
  summary: string;
  role: string;
  createdAt: Date;
}
```

3. 实现 `LlmDeduplicator` 类:
```typescript
import { generateSummaryWithLLM } from '../config/llm.js';

export class LlmDeduplicator {
  async checkDuplicate(mem1: MemoryPair, mem2: MemoryPair): Promise<DeduplicationResult> {
    // 1. 构建 prompt
    // 2. 调用 LLM
    // 3. 解析响应
  }

  async batchCheck(
    pairs: [MemoryPair, MemoryPair][],
    concurrency: number = 3
  ): Promise<Map<string, DeduplicationResult>> {
    // 分批处理，避免 API 限流
  }

  private buildPrompt(mem1: MemoryPair, mem2: MemoryPair): string {
    // 返回去重判断 prompt
  }

  private parseResponse(response: string): DeduplicationResult {
    // 解析 JSON 响应
  }
}
```

4. 创建测试文件 `tests/services/llmDeduplicator.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest';
import { LlmDeduplicator } from '../../src/services/llmDeduplicator.js';

// Mock LLM 调用
vi.mock('../../src/config/llm.js', () => ({
  generateSummaryWithLLM: vi.fn()
}));

describe('LlmDeduplicator', () => {
  it('should detect duplicate memories', async () => {
    // ...
  });

  it('should detect non-duplicate memories', async () => {
    // ...
  });

  it('should handle LLM call failure', async () => {
    // ...
  });

  it('should batch check with concurrency control', async () => {
    // ...
  });
});
```

**验证:**
```bash
npm run build
npm run test
```

**Commit:**
```bash
git add src/services/llmDeduplicator.ts tests/services/llmDeduplicator.test.ts
git commit -m "feat: 添加 LlmDeduplicator 语义去重服务"
```

---

### Task 2: 改造 Scheduler 去重逻辑

**目标**: 将去重逻辑从共享实体判断改为 LLM 语义判断

**文件:**
- Modify: `src/services/scheduler.ts`
- Test: `tests/services/scheduler-dedup.test.ts`

**实现步骤:**

1. 在 `scheduler.ts` 顶部添加导入:
```typescript
import { LlmDeduplicator, MemoryPair } from './llmDeduplicator.js';
```

2. 添加 `findDuplicateCandidates()` 方法:
```typescript
private findDuplicateCandidates(): [MemoryPair, MemoryPair][] {
  const candidates: [MemoryPair, MemoryPair][] = [];
  const processed = new Set<string>();

  const memories = this.db.prepare(`
    SELECT id, summary, role, created_at
    FROM memories
    WHERE is_archived = FALSE AND is_duplicate = FALSE
    ORDER BY created_at DESC
  `).all() as any[];

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

      // 规则 2: 同一天 + 同一角色 + 摘要相似
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

3. 替换 `deduplicate()` 方法:
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

      this.db.prepare(`
        UPDATE memories
        SET is_duplicate = TRUE, duplicate_of = ?
        WHERE id = ?
      `).run(mem1Id, mem2Id);

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
```

**验证:**
```bash
npm run build
npm run test
```

**Commit:**
```bash
git add src/services/scheduler.ts
git commit -m "feat: Scheduler 去重逻辑改用 LLM 语义判断"
```

---

### Task 3: 改造 Scheduler 总结逻辑

**目标**: 总结逻辑直接使用 summary 字段，不再依赖 content_path

**文件:**
- Modify: `src/services/scheduler.ts`
- Remove: `fs.readFile` 相关代码

**实现步骤:**

1. 添加 `formatSummariesForLLM()` 辅助方法:
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
```

2. 替换 `dailySummary()` 方法:
```typescript
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
```

3. 同样替换 `weeklySummary()` 和 `monthlySummary()` 方法，使用 `formatSummariesForLLM()` 而不是 `fs.readFile`

4. 移除 `import { fs }` 相关代码（如果不再需要）

**验证:**
```bash
npm run build
npm run test
```

**Commit:**
```bash
git add src/services/scheduler.ts
git commit -m "feat: Scheduler 总结逻辑直接使用 summary 字段"
```

---

### Task 4: 集成测试和验证

**目标**: 端到端验证新功能

**文件:**
- Test: `tests/integration/scheduler-llm.test.ts`

**测试步骤:**

1. 创建集成测试文件:
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { Scheduler } from '../../src/services/scheduler.js';
import { LlmDeduplicator } from '../../src/services/llmDeduplicator.js';

describe('Scheduler LLM Integration', () => {
  let db: Database.Database;
  let scheduler: Scheduler;

  beforeEach(() => {
    // 创建内存数据库
    db = new Database(':memory:');
    // 初始化 schema...
    scheduler = new Scheduler(db);
  });

  afterEach(() => {
    db.close();
  });

  it('should deduplicate using LLM', async () => {
    // 创建测试数据
    // 运行去重
    // 验证结果
  });

  it('should generate daily summary from summaries', async () => {
    // 创建测试数据
    // 运行总结
    // 验证结果
  });
});
```

2. 手动验证:
```bash
# 构建并部署
npm run build
cp -r dist/* ~/.openclaw/extensions/claw-memory/dist/

# 重启服务
sudo systemctl restart openclaw-gateway

# 查看日志
journalctl -u openclaw-gateway -f | grep -i "ClawMemory\|Scheduler"
```

**验证:**
```bash
npm run build
npm run test
```

**Commit:**
```bash
git add tests/integration/
git commit -m "test: 添加 Scheduler LLM 集成测试"
```

---

### Task 5: 版本更新和发布

**目标**: 更新版本号并准备发布

**文件:**
- Modify: `package.json`
- Modify: `README.md`

**实现步骤:**

1. 更新 `package.json` 版本号:
```json
{
  "version": "0.8.0"
}
```

2. 更新 `README.md` 路线图:
```markdown
## 路线图
- [x] LLM 语义去重
- [x] 总结逻辑改造（直接使用 summary）
```

**Commit:**
```bash
git add package.json README.md
git commit -m "chore: release v0.8.0"
```

---

## 执行顺序

```
Task 1 ──▶ Task 2 ──▶ Task 3 ──▶ Task 4 ──▶ Task 5
 │          │          │          │          │
 ▼          ▼          ▼          ▼          ▼
创建       改造       改造       集成       发布
去重服务   去重逻辑   总结逻辑   测试
```

---

## 预期成果

| 指标 | 改造前 | 改造后 |
|------|--------|--------|
| 去重准确性 | ~30% (误判多) | ~90% (LLM 判断) |
| 总结生成 | 失败 (content_path 空) | 成功 (使用 summary) |
| time_buckets | 0 条 | 每日 1 条 |

---

## 风险缓解

| 风险 | 缓解措施 |
|------|----------|
| LLM API 限流 | batchCheck 并发控制 (3) |
| LLM 调用失败 | 保守策略：默认不标记重复 |
| 测试覆盖不足 | 单元测试 + 集成测试 |
