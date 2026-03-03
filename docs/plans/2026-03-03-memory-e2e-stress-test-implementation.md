# Memory E2E & Stress Test Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement E2E and stress tests for claw-memory component with real conversation logs and batch LLM calls for retrieval accuracy evaluation.

**Architecture:** Create test infrastructure with fixtures, test runners, and evaluation utilities. Use batch LLM calls to reduce API usage during stress test.

**Tech Stack:** TypeScript, Vitest, better-sqlite3

---

## Task 1: Create Test Fixtures Directory and Sample Data

**Files:**
- Create: `test/fixtures/conversations.json`
- Create: `test/fixtures/ground-truth.json`

**Step 1: Create fixtures directory**

Run: `mkdir -p test/fixtures`

**Step 2: Create sample conversations JSON**

Write `test/fixtures/conversations.json`:

```json
{
  "conversations": [
    {
      "id": "conv-001",
      "domain": "technology",
      "messages": [
        {
          "role": "user",
          "content": "How do I optimize React component re-renders?"
        },
        {
          "role": "assistant",
          "content": "Use React.memo, useMemo, and useCallback to prevent unnecessary re-renders. Also consider lifting state up or using context properly."
        }
      ]
    },
    {
      "id": "conv-002",
      "domain": "database",
      "messages": [
        {
          "role": "user",
          "content": "How to optimize PostgreSQL query performance?"
        },
        {
          "role": "assistant",
          "content": "Use EXPLAIN ANALYZE to identify slow queries, add indexes on frequently queried columns, and consider partitioning large tables."
        }
      ]
    }
  ]
}
```

**Step 3: Create ground truth for retrieval evaluation**

Write `test/fixtures/ground-truth.json`:

```json
{
  "queries": [
    {
      "query": "React 组件优化",
      "expected_domain": "technology",
      "expected_conv_ids": ["conv-001"]
    },
    {
      "query": "数据库性能",
      "expected_domain": "database",
      "expected_conv_ids": ["conv-002"]
    }
  ]
}
```

**Step 4: Commit**

Run: `git add test/fixtures/ && git commit -m "test: add sample conversation fixtures"`

---

## Task 2: Create Test Utilities - Database Setup & Batch LLM

**Files:**
- Create: `test/utils/db.ts`
- Create: `test/utils/llm.ts`

**Step 1: Create test database utility**

Write `test/utils/db.ts`:

```typescript
import Database from 'better-sqlite3';
import { getDatabase } from '../../src/db/schema.js';
import path from 'path';
import fs from 'fs';

const TEST_DB_DIR = path.join(process.cwd(), 'test', 'data');
const TEST_DB_PATH = path.join(TEST_DB_DIR, 'test-memory.db');

export function setupTestDB(): Database.Database {
  if (!fs.existsSync(TEST_DB_DIR)) {
    fs.mkdirSync(TEST_DB_DIR, { recursive: true });
  }
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
  return getDatabase(TEST_DB_PATH);
}

export function cleanupTestDB(): void {
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
}
```

**Step 2: Create batch LLM utility**

Write `test/utils/llm.ts`:

```typescript
import type { MemoryMetadata } from '../../src/types.js';

interface BatchExtractResult {
  contents: string[];
  metadatas: MemoryMetadata[];
}

export async function batchExtractMetadata(
  contents: string[],
  _llmClient: any
): Promise<BatchExtractResult> {
  // Placeholder: join contents and extract metadata in batch
  // In real implementation, call LLM once with all contents
  const metadatas: MemoryMetadata[] = contents.map((content) => ({
    tags: [],
    subjects: [],
    keywords: [],
    importance: 0.5,
    summary: content.substring(0, 100)
  }));

  return { contents, metadatas };
}
```

**Step 3: Commit**

Run: `git add test/utils/ && git commit -m "test: add test utilities for DB and batch LLM"`

---

## Task 3: Create E2E Test - Full Workflow

**Files:**
- Create: `test/e2e/memory-workflow.test.ts`

**Step 1: Write failing test**

Write `test/e2e/memory-workflow.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDB, cleanupTestDB } from '../utils/db.js';
import { MemoryService } from '../../src/services/memory.js';
import type { Database } from 'better-sqlite3';

describe('Memory E2E Workflow', () => {
  let db: Database.Database;
  let memoryService: MemoryService;
  const dataDir = './test/data';

  beforeEach(() => {
    db = setupTestDB();
    memoryService = new MemoryService(db, dataDir);
  });

  afterEach(() => {
    cleanupTestDB();
  });

  it('should save memory and retrieve it', async () => {
    // Save memory
    const result = await memoryService.saveMemory({
      content: 'React uses virtual DOM to optimize rendering',
      metadata: {
        tags: ['技术', '前端', 'React'],
        subjects: ['React'],
        keywords: ['virtual DOM', 'rendering'],
        importance: 0.8,
        summary: 'React rendering optimization'
      }
    });

    expect(result.id).toBeDefined();

    // Search memory
    const searchResults = await memoryService.searchMemory({
      query: 'React',
      limit: 10,
      timeRange: 'all'
    });

    expect(searchResults.length).toBeGreaterThan(0);
    expect(searchResults[0].content).toContain('React');
  });

  it('should get context for query', async () => {
    await memoryService.saveMemory({
      content: 'Use React.memo to prevent unnecessary re-renders'
    });

    const context = await memoryService.getContext({
      query: 'React optimization',
      maxTokens: 1000
    });

    expect(context).toBeDefined();
  });

  it('should get summary for period', async () => {
    await memoryService.saveMemory({
      content: 'Meeting: discuss project timeline'
    });

    const summary = await memoryService.getSummary('day');
    expect(summary).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- test/e2e/memory-workflow.test.ts`
Expected: FAIL (file doesn't exist yet)

**Step 3: Create minimal implementation (if needed)**

The test should pass if MemoryService is properly implemented.

**Step 4: Run test to verify it passes**

Run: `npm test -- test/e2e/memory-workflow.test.ts`
Expected: PASS

**Step 5: Commit**

Run: `git add test/e2e/ && git commit -m "test: add E2E workflow test"`

---

## Task 4: Create Stress Test - Batch Write & Accuracy Evaluation

**Files:**
- Create: `test/stress/batch-write.test.ts`
- Create: `test/stress/accuracy-metrics.ts`

**Step 1: Write accuracy metrics utility**

Write `test/stress/accuracy-metrics.ts`:

```typescript
interface EvaluationResult {
  recall: number;
  precision: number;
  mrr: number;
  ndcg: number;
}

interface QueryGroundTruth {
  query: string;
  expected_domain: string;
  expected_conv_ids: string[];
}

export function calculateMetrics(
  retrievedIds: string[],
  groundTruth: QueryGroundTruth,
  k: number = 10
): EvaluationResult {
  const topK = retrievedIds.slice(0, k);
  const relevant = groundTruth.expected_conv_ids;

  // Recall@K
  const relevantRetrieved = topK.filter(id => relevant.includes(id)).length;
  const recall = relevant.length > 0 ? relevantRetrieved / relevant.length : 0;

  // Precision@K
  const precision = topK.length > 0 ? relevantRetrieved / topK.length : 0;

  // MRR
  let rr = 0;
  for (let i = 0; i < topK.length; i++) {
    if (relevant.includes(topK[i])) {
      rr = 1 / (i + 1);
      break;
    }
  }
  const mrr = rr;

  // NDCG
  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    if (relevant.includes(topK[i])) {
      dcg += 1 / Math.log2(i + 2);
    }
  }
  const idcg = relevant.reduce((sum, _, i) => sum + 1 / Math.log2(i + 2), 0);
  const ndcg = idcg > 0 ? dcg / idcg : 0;

  return { recall, precision, mrr, ndcg };
}
```

**Step 2: Write batch write stress test**

Write `test/stress/batch-write.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestDB, cleanupTestDB } from '../utils/db.js';
import { MemoryService } from '../../src/services/memory.js';
import { calculateMetrics } from './accuracy-metrics.js';
import type { Database } from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

describe('Stress Test: Batch Write & Retrieval', () => {
  let db: Database.Database;
  let memoryService: MemoryService;
  const dataDir = './test/data';

  beforeEach(() => {
    db = setupTestDB();
    memoryService = new MemoryService(db, dataDir);
  });

  afterEach(() => {
    cleanupTestDB();
  });

  it('should batch write 1000 memories efficiently', async () => {
    const domains = ['technology', 'database', 'product', 'office'];
    const contents: string[] = [];

    // Generate 1000 test memories
    for (let i = 0; i < 1000; i++) {
      const domain = domains[i % domains.length];
      contents.push(`Test content ${i} for domain ${domain}`);
    }

    const startTime = Date.now();

    // Batch save (in real impl, use batch LLM call)
    for (const content of contents) {
      await memoryService.saveMemory({ content });
    }

    const duration = Date.now() - startTime;
    const throughput = (contents.length / duration) * 1000;

    console.log(`Wrote ${contents.length} memories in ${duration}ms`);
    console.log(`Throughput: ${throughput.toFixed(2)} ops/sec`);

    expect(throughput).toBeGreaterThan(10); // At least 10 ops/sec
  });

  it('should evaluate retrieval accuracy', async () => {
    // Save test memories
    await memoryService.saveMemory({
      content: 'React uses virtual DOM for efficient rendering',
      metadata: { tags: ['tech', 'react'], importance: 0.8 }
    });
    await memoryService.saveMemory({
      content: 'PostgreSQL supports JSON columns',
      metadata: { tags: ['database', 'postgresql'], importance: 0.7 }
    });

    // Load ground truth
    const groundTruthPath = path.join(process.cwd(), 'test', 'fixtures', 'ground-truth.json');
    const groundTruth = JSON.parse(fs.readFileSync(groundTruthPath, 'utf-8'));

    // Evaluate each query
    const results = [];
    for (const qt of groundTruth.queries) {
      const searchResults = await memoryService.searchMemory({
        query: qt.query,
        limit: 10,
        timeRange: 'all'
      });

      const retrievedIds = searchResults.map((r: any) => r.id);
      const metrics = calculateMetrics(retrievedIds, qt, 10);
      results.push({ query: qt.query, metrics });
    }

    // Check average metrics
    const avgRecall = results.reduce((sum, r) => sum + r.metrics.recall, 0) / results.length;
    console.log('Average Recall:', avgRecall);

    expect(avgRecall).toBeGreaterThan(0.5);
  });
});
```

**Step 3: Run test to verify it fails**

Run: `npm test -- test/stress/batch-write.test.ts`
Expected: FAIL (file doesn't exist)

**Step 4: Commit**

Run: `git add test/stress/ && git commit -m "test: add stress test with batch write and accuracy metrics"`

---

## Task 5: Update package.json Test Scripts

**Files:**
- Modify: `package.json`

**Step 1: Add test scripts**

Edit `package.json` to add:

```json
"scripts": {
  "test:e2e": "vitest run test/e2e",
  "test:stress": "vitest run test/stress",
  "test:all": "vitest run"
}
```

**Step 2: Commit**

Run: `git add package.json && git commit -m "test: add e2e and stress test scripts"`

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Create test fixtures with sample conversations | `test/fixtures/` |
| 2 | Create test utilities (DB, batch LLM) | `test/utils/` |
| 3 | Create E2E workflow test | `test/e2e/memory-workflow.test.ts` |
| 4 | Create stress test with accuracy metrics | `test/stress/` |
| 5 | Update package.json test scripts | `package.json` |

**Plan complete and saved to `docs/plans/2026-03-03-memory-e2e-stress-test-implementation.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
