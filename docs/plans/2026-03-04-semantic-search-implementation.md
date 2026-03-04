# ClawMemory 语义搜索实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**目标：** 实现语义向量搜索功能，使搜索能够理解语义相似性，提供更准确的记忆检索。

**架构：** 采用混合搜索架构，并行执行关键词搜索（SQL LIKE）和语义搜索（向量相似度），合并结果后按相关性排序返回。

**技术栈：** TypeScript, SQLite, LLM API (Embedding), 向量相似度计算

---

## Task 1: 创建 Embedding 服务模块

**Files:**
- Create: `src/services/embedding.ts`
- Test: `test/services/embedding.test.ts`

**Step 1: 创建 Embedding 服务基础代码**

```typescript
// src/services/embedding.ts

export interface EmbeddingConfig {
  format: 'openai' | 'anthropic' | 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
  dimension: number;
}

const DEFAULT_CONFIG: Partial<EmbeddingConfig> = {
  model: 'text-embedding-3-small',
  dimension: 1536,
};

export async function generateEmbedding(
  text: string,
  config?: EmbeddingConfig
): Promise<number[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  const response = await fetch(`${cfg.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cfg.apiKey}`,
    },
    body: JSON.stringify({
      input: text,
      model: cfg.model,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${error}`);
  }

  const data = await response.json() as {
    data: { embedding: number[] }[];
  };

  return data.data[0]?.embedding || [];
}
```

**Step 2: 编写测试**

```typescript
// test/services/embedding.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateEmbedding } from '../../src/services/embedding';

describe('embedding service', () => {
  it('should generate embedding for text', async () => {
    // Mock fetch response
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ embedding: new Array(1536).fill(0.1) }],
      }),
    });

    const embedding = await generateEmbedding('测试文本');
    expect(embedding).toHaveLength(1536);
  });
});
```

**Step 3: 运行测试验证**

```bash
cd /home/ubuntu/openclaw/claw-memory
pnpm test test/services/embedding.test.ts
```

**Expected:** 测试通过

---

## Task 2: 实现向量相似度计算函数

**Files:**
- Modify: `src/services/embedding.ts`

**Step 1: 添加余弦相似度函数**

```typescript
// 在 embedding.ts 中添加

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimension');
  }

  const dotProduct = a.reduce((sum, v, i) => sum + v * b[i], 0);
  const magnitudeA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
  const magnitudeB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

export function normalizeVector(v: number[]): number[] {
  const magnitude = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return v;
  return v.map(val => val / magnitude);
}
```

**Step 2: 添加测试**

```typescript
// 在 test/services/embedding.test.ts 中添加

it('should calculate cosine similarity', () => {
  const a = [1, 0, 0];
  const b = [1, 0, 0];
  const c = [0, 1, 0];

  expect(cosineSimilarity(a, b)).toBe(1);
  expect(cosineSimilarity(a, c)).toBe(0);
});
```

**Step 3: 运行测试**

```bash
pnpm test test/services/embedding.test.ts
```

---

## Task 3: 创建语义搜索服务

**Files:**
- Create: `src/services/semanticSearch.ts`
- Test: `test/services/semanticSearch.test.ts`

**Step 1: 实现语义搜索核心逻辑**

```typescript
// src/services/semanticSearch.ts
import { getDatabase } from '../db/schema.js';
import { generateEmbedding, cosineSimilarity } from './embedding.js';

interface Memory {
  id: string;
  summary: string;
  role: string;
  created_at: string;
  embedding?: number[];
}

interface SearchResult extends Memory {
  relevanceScore: number;
  matchType: 'keyword' | 'semantic' | 'both';
}

export async function semanticSearch(
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  const db = getDatabase();

  // 1. 生成查询向量
  const queryEmbedding = await generateEmbedding(query);

  // 2. 获取所有有向量的记忆
  const memories = db.prepare(`
    SELECT m.id, m.summary, m.role, m.created_at, e.embedding
    FROM memories m
    LEFT JOIN memory_entities me ON m.id = me.memory_id
    LEFT JOIN entities e ON me.entity_id = e.id
    WHERE e.embedding IS NOT NULL
    GROUP BY m.id
  `).all() as Memory[];

  // 3. 计算相似度
  const results: SearchResult[] = memories
    .map(memory => {
      const similarity = memory.embedding
        ? cosineSimilarity(queryEmbedding, memory.embedding)
        : 0;
      return {
        ...memory,
        relevanceScore: similarity,
        matchType: 'semantic' as const,
      };
    })
    .filter(r => r.relevanceScore > 0.3)  // 阈值过滤
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);

  return results;
}
```

**Step 2: 编写测试（mock 数据库）**

```typescript
// test/services/semanticSearch.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/schema.js', () => ({
  getDatabase: vi.fn(),
}));

describe('semantic search', () => {
  it('should return semantic matches', async () => {
    // Test implementation
  });
});
```

---

## Task 4: 实现混合搜索功能

**Files:**
- Modify: `src/services/semanticSearch.ts`

**Step 1: 添加混合搜索函数**

```typescript
// 在 semanticSearch.ts 中添加

import type { Database } from 'better-sqlite3';

export async function hybridSearch(
  query: string,
  limit: number = 10,
  keywordWeight: number = 0.5,
  semanticWeight: number = 0.5
): Promise<SearchResult[]> {
  const db = getDatabase();

  // 1. 关键词搜索（从现有 plugin.ts 提取逻辑）
  const keywordResults = keywordSearch(db, query, limit);

  // 2. 语义搜索
  const semanticResults = await semanticSearch(query, limit);

  // 3. 合并结果
  const merged = new Map<string, SearchResult>();

  for (const r of keywordResults) {
    merged.set(r.id, { ...r, matchType: 'keyword', relevanceScore: r.relevanceScore * keywordWeight });
  }

  for (const r of semanticResults) {
    if (merged.has(r.id)) {
      const existing = merged.get(r.id)!;
      existing.matchType = 'both';
      existing.relevanceScore += r.relevanceScore * semanticWeight;
    } else {
      merged.set(r.id, { ...r, relevanceScore: r.relevanceScore * semanticWeight });
    }
  }

  // 4. 排序返回
  return Array.from(merged.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}

function keywordSearch(db: Database, query: string, limit: number): SearchResult[] {
  const keywords = query.split(/\s+/).filter(k => k.length > 0);
  const keywordParams = keywords.map(k => `%${k}%`);
  const conditions = keywords.map(() => "summary LIKE ?").join(" OR ");

  const memories = db.prepare(`
    SELECT id, summary, role, created_at
    FROM memories
    WHERE ${conditions}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...keywordParams, limit) as Memory[];

  return memories.map(m => ({
    ...m,
    relevanceScore: 1,
    matchType: 'keyword',
  }));
}
```

---

## Task 5: 在保存实体时生成 Embedding

**Files:**
- Modify: `src/plugin.ts` - 在 message_received hook 中

**Step 1: 添加实体 embedding 生成逻辑**

在 plugin.ts 的 message_received hook 中，找到保存实体的部分，添加：

```typescript
// 在保存实体后，生成 embedding
import { generateEmbedding } from './services/embedding.js';

// ... 现有保存实体代码 ...

// 生成 embedding 并保存
if (entity && entity.id) {
  const embedding = await generateEmbedding(entity.name);
  db.prepare(`
    UPDATE entities SET embedding = ? WHERE id = ?
  `).run(JSON.stringify(embedding), entity.id);
}
```

**Step 2: 确保 embedding 列存在**

在 schema.ts 中确认 entities 表有 embedding 列（已有 BLOB 类型）。

---

## Task 6: 集成混合搜索到工具

**Files:**
- Modify: `src/plugin.ts` - clawmemory_search 工具

**Step 1: 修改搜索函数**

```typescript
// 在 plugin.ts 的 clawmemory_search execute 函数中

import { hybridSearch } from './services/semanticSearch.js';

// 替换现有搜索逻辑
const results = await hybridSearch(query, limit);

// 修改返回格式，包含相关性得分
const resultsText = results.map((r: any) => {
  const date = new Date(r.created_at).toLocaleDateString();
  const score = (r.relevanceScore * 100).toFixed(1);
  return `[${date}] [${r.role}] [${r.matchType}] (${score}%) ${r.summary || "(无摘要)"}`;
}).join("\n\n");

return jsonResult({
  text: `Found ${results.length} memories:\n\n${resultsText}`
});
```

---

## Task 7: 添加配置和环境变量

**Files:**
- Modify: `src/config/llm.ts` - 添加 embedding 配置

**Step 1: 添加 Embedding 配置**

```typescript
// 在 llm.ts 中添加

export interface EmbeddingConfig {
  model: string;
  dimension: number;
}

export function getEmbeddingConfig(): EmbeddingConfig {
  return {
    model: process.env.EMBEDDING_MODEL || 'text-embedding-3-small',
    dimension: parseInt(process.env.EMBEDDING_DIMENSION || '1536', 10),
  };
}
```

---

## Task 8: 构建、测试和部署

**Step 1: 构建项目**

```bash
cd /home/ubuntu/openclaw/claw-memory
pnpm build
```

**Step 2: 运行所有测试**

```bash
pnpm test
```

**Step 3: 发布到 npm**

```bash
npm publish --access public
```

**Step 4: 更新扩展目录**

```bash
cd /home/ubuntu/.openclaw/extensions/claw-memory
pnpm add @yun-zero/claw-memory@latest
pnpm build
pnpm rebuild better-sqlite3
```

**Step 5: 重启 OpenClaw**

```bash
pkill -f openclaw-gateway && openclaw-gateway &
```

---

## 验收测试

1. **关键词搜索仍有效** - 搜索 "股票" 返回结果
2. **语义搜索生效** - 搜索 "股票" 能匹配到 "洛阳钼业"
3. **混合排序** - 精确匹配排在语义匹配前面
4. **性能** - 搜索延迟 < 2秒

---

## 执行方式

**Plan complete and saved to `docs/plans/2026-03-04-semantic-search-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
