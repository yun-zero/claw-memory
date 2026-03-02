# 增量更新整体记忆摘要实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在会话结束时，一次 LLM 调用同时提取当前会话元数据并整合整体摘要，后续查询直接返回缓存摘要。

**Architecture:** 修改 memories 表添加 integrated_summary 字段，更新 MetadataExtractor prompt 支持传入已有摘要，修改 MemoryService 在保存时获取和更新摘要。

**Tech Stack:** TypeScript, better-sqlite3, LLM API

---

## Task 1: 添加 integrated_summary 字段到数据库

**Files:**
- Modify: `src/db/schema.ts:6-20`
- Test: `tests/db/schema.test.ts`

**Step 1: 修改 schema 添加字段**

```typescript
// src/db/schema.ts memories 表中添加
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    content_path TEXT NOT NULL,
    summary TEXT,
    integrated_summary JSON,  -- 新增
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    token_count INTEGER DEFAULT 0,
    importance REAL DEFAULT 0.5,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP,
    is_archived BOOLEAN DEFAULT FALSE,
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_of TEXT
  )
`);
```

**Step 2: 运行测试验证**

```bash
npm test tests/db/schema.test.ts
```
Expected: PASS

**Step 3: 提交**

```bash
git add src/db/schema.ts
git commit -m "feat: add integrated_summary field to memories table"
```

---

## Task 2: 更新 TypeScript 类型定义

**Files:**
- Modify: `src/types.ts:6-19`

**Step 1: 添加 IntegratedSummary 接口和字段**

```typescript
// src/types.ts

export interface IntegratedSummary {
  active_areas: string[];
  key_topics: string[];
  recent_summary: string;
}

export interface Memory {
  id: string;
  contentPath: string;
  summary: string | null;
  integratedSummary: IntegratedSummary | null;  // 新增
  createdAt: Date;
  updatedAt: Date;
  tokenCount: number;
  importance: number;
  accessCount: number;
  lastAccessedAt: Date | null;
  isArchived: boolean;
  isDuplicate: boolean;
  duplicateOf: string | null;
}
```

**Step 2: 运行构建验证**

```bash
npm run build
```
Expected: PASS

**Step 3: 提交**

```bash
git add src/types.ts
git commit -m "feat: add IntegratedSummary type definition"
```

---

## Task 3: 更新 Repository 支持 integrated_summary

**Files:**
- Modify: `src/db/repository.ts`
- Test: `tests/db/repository.test.ts`

**Step 1: 更新 CreateMemoryInput 和 insert**

```typescript
// src/db/repository.ts

export interface CreateMemoryInput {
  contentPath: string;
  summary?: string;
  integratedSummary?: IntegratedSummary;  // 新增
  importance?: number;
  tokenCount?: number;
}

// create 方法中
this.db.prepare(`
  INSERT INTO memories (id, content_path, summary, integrated_summary, importance, token_count, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`).run(
  id,
  input.contentPath,
  input.summary || null,
  input.integratedSummary ? JSON.stringify(input.integratedSummary) : null,  // 新增
  input.importance ?? 0.5,
  input.tokenCount ?? 0,
  now.toISOString(),
  now.toISOString()
);
```

**Step 2: 更新 mapRowToMemory**

```typescript
// mapRowToMemory 方法中添加
integratedSummary: row.integrated_summary ? JSON.parse(row.integrated_summary) : null,
```

**Step 3: 添加测试**

```typescript
// tests/db/repository.test.ts
it('should save and retrieve integrated summary', () => {
  const memory = repo.create({
    contentPath: '/test/path.md',
    summary: 'Test summary',
    integratedSummary: {
      active_areas: ['技术/AI (5)'],
      key_topics: ['React', 'OpenClaw'],
      recent_summary: '本周讨论了AI技术'
    }
  });

  const found = repo.findById(memory.id);
  expect(found.integratedSummary).toEqual({
    active_areas: ['技术/AI (5)'],
    key_topics: ['React', 'OpenClaw'],
    recent_summary: '本周讨论了AI技术'
  });
});
```

**Step 4: 运行测试**

```bash
npm test tests/db/repository.test.ts
```
Expected: PASS

**Step 5: 提交**

```bash
git add src/db/repository.ts tests/db/repository.test.ts
git commit -m "feat: support integrated_summary in repository"
```

---

## Task 4: 更新 MetadataExtractor 支持已有摘要

**Files:**
- Modify: `src/services/metadataExtractor.ts`

**Step 1: 更新 extract 方法签名和 prompt**

```typescript
// src/services/metadataExtractor.ts

export interface ExtractedMetadata {
  tags: string[];
  keywords: string[];
  subjects: string[];
  importance: number;
  summary: string;
  integratedSummary: IntegratedSummary;
}

const EXTRACTION_PROMPT = `请从以下对话内容中提取结构化元数据，并整合已有的整体摘要：

当前对话内容：
{content}

已有整体摘要（请在此基础上增量更新）：
{existing_summary}

请以 JSON 格式返回：
{
  "tags": ["一级分类/二级分类"],
  "keywords": ["关键词1", "关键词2"],
  "subjects": ["主题1"],
  "importance": 0.0-1.0,
  "summary": "当前对话的一句话摘要",
  "integrated_summary": {
    "active_areas": ["领域名 (出现次数)"],
    "key_topics": ["主题1", "主题2"],
    "recent_summary": "整体摘要自然语言描述"
  }
}

注意：
- tags 使用层级结构
- integrated_summary 需整合历史信息，在已有基础上增加新领域
- 只返回 JSON，不要其他内容`;

export class MetadataExtractor {
  async extract(content: string, existingSummary?: IntegratedSummary): Promise<ExtractedMetadata> {
    let existingSummaryText = '无';
    if (existingSummary) {
      existingSummaryText = `活跃领域: ${existingSummary.active_areas.join(', ')}\n关键词: ${existingSummary.key_topics.join(', ')}\n近期摘要: ${existingSummary.recent_summary}`;
    }

    const prompt = EXTRACTION_PROMPT
      .replace('{content}', content)
      .replace('{existing_summary}', existingSummaryText);

    try {
      const response = await generateSummaryWithLLM(prompt);
      return this.parseLLMResponse(response);
    } catch (error) {
      console.warn('LLM extraction failed:', error);
      return this.fallbackExtract(content);
    }
  }

  private fallbackExtract(content: string): ExtractedMetadata {
    return {
      tags: [],
      keywords: [],
      subjects: [],
      importance: 0.5,
      summary: content.substring(0, 100),
      integratedSummary: {
        active_areas: [],
        key_topics: [],
        recent_summary: ''
      }
    };
  }
}
```

**Step 2: 运行测试**

```bash
npm test tests/services/metadataExtractor.test.ts
```
Expected: PASS

**Step 3: 提交**

```bash
git add src/services/metadataExtractor.ts
git commit -m "feat: support existing summary in metadata extraction"
```

---

## Task 5: 修改 MemoryService 集成摘要更新

**Files:**
- Modify: `src/services/memory.ts`

**Step 1: 添加获取最新摘要的方法**

```typescript
// src/services/memory.ts

// 在 MemoryService 类中添加
async getLatestIntegratedSummary(): Promise<IntegratedSummary | null> {
  const memories = this.memoryRepo.findAll(1);
  if (memories.length === 0) return null;
  return memories[0].integratedSummary;
}
```

**Step 2: 修改 saveMemory 方法**

```typescript
async saveMemory(input: SaveMemoryInput): Promise<Memory> {
  const { content, metadata } = input;

  // ... 现有代码：文件保存 ...

  // 获取已有的整体摘要
  const existingSummary = await this.getLatestIntegratedSummary();

  // 调用 LLM 提取元数据（传入已有摘要）
  const extracted = content.trim()
    ? await this.extractor.extract(content, existingSummary || undefined)
    : { tags: [], keywords: [], subjects: [], importance: 0.5, summary: '', integratedSummary: existingSummary || { active_areas: [], key_topics: [], recent_summary: '' } };

  // 合并元数据
  const mergedMetadata = {
    tags: extracted.tags,
    keywords: extracted.keywords,
    subjects: extracted.subjects,
    importance: extracted.importance,
    summary: extracted.summary,
    ...metadata
  };

  // 创建记忆记录（包含 integrated_summary）
  const memoryInput: CreateMemoryInput = {
    contentPath,
    summary: mergedMetadata.summary || undefined,
    integratedSummary: extracted.integratedSummary,  // 新增
    importance: clampedImportance ?? 0.5,
    tokenCount: this.estimateTokens(content)
  };

  const memory = this.memoryRepo.create(memoryInput);

  // ... 现有代码：实体处理 ...

  return memory;
}
```

**Step 3: 运行测试**

```bash
npm test tests/services/memory.test.ts
```
Expected: PASS

**Step 4: 提交**

```bash
git add src/services/memory.ts
git commit -m "feat: integrate summary update in saveMemory"
```

---

## Task 6: 更新 get_memory_index 返回缓存摘要

**Files:**
- Modify: `src/services/memoryIndex.ts`
- Test: `tests/mcp/memoryIndex.test.ts`

**Step 1: 修改 getMemoryIndex 函数**

```typescript
// src/services/memoryIndex.ts

export async function getMemoryIndex(db: Database.Database, options: MemoryIndexOptions): Promise<MemoryIndex> {
  const { startDate, endDate } = calculatePeriodRange(options.period, options.date);

  // ... 现有代码：获取 tags, keywords ...

  // 获取缓存的整体摘要（从最新的 memory）
  const memoryRepo = new MemoryRepository(db);
  const latestMemory = memoryRepo.findAll(1)[0];
  const integratedSummary = latestMemory?.integratedSummary || null;

  return {
    period: { start: startDate, end: endDate },
    activeAreas: { tags, keywords },
    todos,
    recentActivity,
    integratedSummary  // 新增
  };
}
```

**Step 2: 更新接口定义**

```typescript
export interface MemoryIndex {
  period: { start: string; end: string };
  activeAreas: {
    tags: { name: string; count: number }[];
    keywords: string[];
  };
  todos: { id: string; content: string; period: string }[];
  recentActivity: { date: string; summary: string }[];
  integratedSummary?: {  // 新增
    active_areas: string[];
    key_topics: string[];
    recent_summary: string;
  };
}
```

**Step 3: 添加测试**

```typescript
// tests/mcp/memoryIndex.test.ts
it('should return integrated summary from latest memory', async () => {
  // 先保存一个带 integrated_summary 的 memory
  const memoryService = new MemoryService(db, './test_memories');
  await memoryService.saveMemory({
    content: 'Test content',
    metadata: { summary: 'Test' }
  });

  const result = await getMemoryIndex(db, { period: 'week' });
  expect(result.integratedSummary).toBeDefined();
});
```

**Step 4: 运行测试**

```bash
npm test tests/mcp/memoryIndex.test.ts
```
Expected: PASS

**Step 5: 提交**

```bash
git add src/services/memoryIndex.ts tests/mcp/memoryIndex.test.ts
git commit -m "feat: return cached integrated summary in getMemoryIndex"
```

---

## Task 7: 完整测试验证

**Step 1: 运行所有测试**

```bash
npm test
```
Expected: PASS (所有测试)

**Step 2: 提交**

```bash
git add -A
git commit -m "feat: implement incremental summary update

- Add integrated_summary field to memories table
- Update MetadataExtractor to accept existing summary
- Integrate summary update in saveMemory
- Return cached summary in getMemoryIndex"

---
