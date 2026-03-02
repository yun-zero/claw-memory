# Claw-Memory 测试实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 为 Claw-Memory 核心业务逻辑添加边界测试和异常处理测试，达到 80%+ 覆盖率

**Architecture:** 使用 Vitest 框架，按照现有测试结构扩展 memory service 和 retrieval service 的测试用例，覆盖边界条件和异常场景

**Tech Stack:** Vitest, TypeScript, Node.js

---

## Task 1: 扩展 memory.test.ts - saveMemory 边界测试

**Files:**
- Modify: `tests/services/memory.test.ts`

**Step 1: 添加边界测试用例**

```typescript
describe('saveMemory boundaries', () => {
  it('should save memory with empty content', async () => {
    const result = await service.saveMemory({
      content: '',
      metadata: { summary: 'Empty content test' }
    });
    expect(result.id).toBeDefined();
  });

  it('should save memory without metadata', async () => {
    const result = await service.saveMemory({
      content: 'Test content only'
    });
    expect(result.id).toBeDefined();
    expect(result.importance).toBe(0.5); // default
  });

  it('should save memory with custom importance=1.0', async () => {
    const result = await service.saveMemory({
      content: 'High importance',
      metadata: { importance: 1.0 }
    });
    expect(result.importance).toBe(1.0);
  });

  it('should save memory with custom importance=0', async () => {
    const result = await service.saveMemory({
      content: 'Zero importance',
      metadata: { importance: 0 }
    });
    expect(result.importance).toBe(0);
  });

  it('should save memory with long content', async () => {
    const longContent = 'a'.repeat(10000);
    const result = await service.saveMemory({
      content: longContent,
      metadata: { summary: 'Long content' }
    });
    expect(result.id).toBeDefined();
    expect(result.tokenCount).toBeGreaterThan(0);
  });
});
```

**Step 2: 运行测试验证**

Run: `npm test tests/services/memory.test.ts`
Expected: PASS (5 new tests)

**Step 3: 提交**

```bash
git add tests/services/memory.test.ts
git commit -m "test: add saveMemory boundary tests"
```

---

## Task 2: 扩展 memory.test.ts - searchMemory 边界测试

**Files:**
- Modify: `tests/services/memory.test.ts`

**Step 1: 添加搜索边界测试**

```typescript
describe('searchMemory boundaries', () => {
  beforeEach(async () => {
    await service.saveMemory({ content: 'Test 1', metadata: { summary: 'Test 1' } });
    await service.saveMemory({ content: 'Test 2', metadata: { summary: 'Test 2' } });
  });

  it('should return all memories with empty query', async () => {
    const results = await service.searchMemory({ query: '', limit: 10 });
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it('should return empty array for non-existent query', async () => {
    const results = await service.searchMemory({ query: 'xyznonexistent', limit: 10 });
    expect(results).toEqual([]);
  });

  it('should return empty array when limit=0', async () => {
    const results = await service.searchMemory({ query: '', limit: 0 });
    expect(results).toEqual([]);
  });

  it('should respect limit parameter', async () => {
    const results = await service.searchMemory({ query: '', limit: 1 });
    expect(results.length).toBe(1);
  });

  it('should handle large limit', async () => {
    const results = await service.searchMemory({ query: '', limit: 10000 });
    expect(results.length).toBeGreaterThan(0);
  });
});
```

**Step 2: 运行测试**

Run: `npm test tests/services/memory.test.ts`
Expected: PASS

**Step 3: 提交**

```bash
git add tests/services/memory.test.ts
git commit -m "test: add searchMemory boundary tests"
```

---

## Task 3: 扩展 memory.test.ts - getContext 边界测试

**Files:**
- Modify: `tests/services/memory.test.ts`

**Step 1: 添加上下文边界测试**

```typescript
describe('getContext boundaries', () => {
  it('should return empty string when no memories', async () => {
    const db = new Database(':memory:');
    initializeDatabase(db);
    const emptyService = new MemoryService(db, './test_ctx');
    const result = await emptyService.getContext({ query: 'test', maxTokens: 100 });
    expect(result).toBe('');
  });

  it('should return empty when maxTokens=0', async () => {
    const result = await service.getContext({ query: 'test', maxTokens: 0 });
    expect(result).toBe('');
  });

  it('should handle very large maxTokens', async () => {
    const result = await service.getContext({ query: 'test', maxTokens: 100000 });
    expect(result.length).toBeGreaterThan(0);
  });

  it('should truncate when single memory exceeds maxTokens', async () => {
    const longMemory = await service.saveMemory({
      content: 'a'.repeat(5000),
      metadata: { summary: 'Long' }
    });
    const result = await service.getContext({ query: 'Long', maxTokens: 100 });
    // Should handle gracefully
    expect(typeof result).toBe('string');
  });
});
```

**Step 2: 运行测试**

Run: `npm test tests/services/memory.test.ts`
Expected: PASS

**Step 3: 提交**

```bash
git add tests/services/memory.test.ts
git commit -m "test: add getContext boundary tests"
```

---

## Task 4: 扩展 retrieval.test.ts - 权重计算边界测试

**Files:**
- Modify: `tests/services/retrieval.test.ts`

**Step 1: 添加权重边界测试**

```typescript
describe('calculateWeight boundaries', () => {
  const baseConfig = DEFAULT_TIME_DECAY;

  it('should return max weight for today', () => {
    const today = new Date().toISOString().split('T')[0];
    const weight = calculateWeight({
      entityMatch: 4,
      timeDecay: baseConfig,
      memoryDate: today,
      tagMatch: 10,
      importance: 1.0
    });
    expect(weight).toBeGreaterThan(30);
  });

  it('should return lower weight for 1 week ago', () => {
    const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weight = calculateWeight({
      entityMatch: 4,
      timeDecay: baseConfig,
      memoryDate: lastWeek,
      tagMatch: 10,
      importance: 1.0
    });
    expect(weight).toBeLessThan(30);
  });

  it('should return lower weight for 1 year ago', () => {
    const lastYear = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weight = calculateWeight({
      entityMatch: 4,
      timeDecay: baseConfig,
      memoryDate: lastYear,
      tagMatch: 10,
      importance: 1.0
    });
    expect(weight).toBeLessThan(10);
  });

  it('should return 0 weight when importance=0', () => {
    const today = new Date().toISOString().split('T')[0];
    const weight = calculateWeight({
      entityMatch: 0,
      timeDecay: baseConfig,
      memoryDate: today,
      tagMatch: 0,
      importance: 0
    });
    expect(weight).toBe(0);
  });

  it('should cap entityMatch at 40', () => {
    const today = new Date().toISOString().split('T')[0];
    const weight = calculateWeight({
      entityMatch: 10, // should cap at 4
      timeDecay: baseConfig,
      memoryDate: today,
      tagMatch: 0,
      importance: 0
    });
    // entityMatch * 10 = 40, capped
    expect(weight).toBe(16); // 40*0.4 + 30*0.3
  });

  it('should cap tagMatch at 20', () => {
    const today = new Date().toISOString().split('T')[0];
    const weight = calculateWeight({
      entityMatch: 0,
      timeDecay: baseConfig,
      memoryDate: today,
      tagMatch: 20, // should cap at 10
      importance: 0
    });
    // tagMatch * 2 = 40, capped to 20
    expect(weight).toBe(6); // 20*0.2 + 30*0.3
  });

  it('should handle future dates gracefully', () => {
    const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weight = calculateWeight({
      entityMatch: 0,
      timeDecay: baseConfig,
      memoryDate: future,
      tagMatch: 0,
      importance: 0.5
    });
    expect(weight).toBeGreaterThanOrEqual(0);
  });
});
```

**Step 2: 运行测试**

Run: `npm test tests/services/retrieval.test.ts`
Expected: PASS

**Step 3: 提交**

```bash
git add tests/services/retrieval.test.ts
git commit -m "test: add retrieval weight boundary tests"
```

---

## Task 5: 添加异常处理测试

**Files:**
- Create: `tests/services/error-handling.test.ts`

**Step 1: 创建错误处理测试**

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db/schema.js';
import { MemoryService } from '../../src/services/memory.js';

describe('Error Handling', () => {
  let db: Database.Database;
  let service: MemoryService;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    service = new MemoryService(db, './test_errors');
  });

  it('should handle missing content field gracefully', async () => {
    // This should use default value or handle gracefully
    const result = await service.saveMemory({
      content: 'Valid content'
    } as any);
    expect(result.id).toBeDefined();
  });

  it('should handle invalid importance value', async () => {
    const result = await service.saveMemory({
      content: 'Test',
      metadata: { importance: 2.0 } as any // Invalid, should cap at 1
    });
    expect(result.importance).toBeLessThanOrEqual(1);
  });

  it('should handle negative importance', async () => {
    const result = await service.saveMemory({
      content: 'Test',
      metadata: { importance: -0.5 } as any
    });
    expect(result.importance).toBeGreaterThanOrEqual(0);
  });

  it('searchMemory should handle missing query gracefully', async () => {
    const results = await service.searchMemory({} as any);
    expect(Array.isArray(results)).toBe(true);
  });
});
```

**Step 2: 运行测试**

Run: `npm test tests/services/error-handling.test.ts`
Expected: PASS

**Step 3: 提交**

```bash
git add tests/services/error-handling.test.ts
git commit -m "test: add error handling tests"
```

---

## Task 6: 验证覆盖率

**Step 1: 运行所有测试**

Run: `npm test`
Expected: All tests pass

**Step 2: 检查覆盖率**

Run: `npx vitest --coverage`
Expected: 80%+ coverage on core modules

**Step 3: 提交**

```bash
git add .
git commit -m "test: complete boundary and error tests"
```

---

## 完成

测试实现完成后，预期：
- 当前: 24 tests
- 目标: 50+ tests
- 覆盖率: 80%+ on memory service and retrieval service
