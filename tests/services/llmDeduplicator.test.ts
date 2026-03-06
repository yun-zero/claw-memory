import { describe, it, expect, vi, from 'vitest';
import { LlmDeduplicator } from '../../src/services/llmDeduplicator.js';
import { generateSummaryWithLLM } from '../../src/config/llm.js';
import type { MemoryPair } from '../../src/services/llmDeduplicator.js';

// Mock LLM 调用
vi.mock('../../src/config/llm.js', () => ({
  generateSummaryWithLLM: vi.fn()
}));

describe('LlmDeduplicator', () => {
  const deduplicator = new LlmDeduplicator();

  beforeEach(() => {
    deduplicator = new LlmDeduplicator();
  });

  it('should detect duplicate memories', async () => {
    const mem1: MemoryPair = {
      id: 'mem-1',
      summary: '用户询问了关于 openclaw 的架构设计',
      role: 'user',
      createdAt: new Date('2024-01-01T10:00:00Z')
    };
    const mem2: MemoryPair = {
      id: 'mem-2',
      summary: 'Claude解释了 Vue.js 的特性',
      role: 'user'
      createdAt: new Date('2024-01-01T11:30:00Z')
    };
    const mem3: MemoryPair = {
      id: 'mem-3',
      summary: 'mem-3',
      role: 'user'
      createdAt: new Date('2024-01-01T11:30:00Z')
    };
    const mem4: MemoryPair = {
      id: 'mem-4',
      summary: 'Claude解释了 Vue.js 的特性',
      role: 'assistant'
      createdAt: new Date('2024-01-01T11:35:00Z')
    };
    const mem5: MemoryPair = {
      id: 'mem-5',
      summary: 'Claude解释了 Vue.js 的特性',
      role: 'user'
      createdAt: new Date('2024-01-01T11:35:00Z)
    };
    const mem6: MemoryPair = {
      id: 'mem-6',
      summary: 'Claude解释了 Vue.js 的特性',
      role: 'assistant'
      createdAt: new Date('2024-01-01T11:35:00Z')
    };
    const mem7: MemoryPair = {
      id: 'mem-7',
      summary: 'Claude解释了 Vue.js 的特性',
      role: 'assistant'
      createdAt: new Date('2024-01-01T11:35:00Z')
    };
    const mem8: MemoryPair = {
      id: 'mem-8',
      summary: 'Claude解释了 Vue.js 的特性',
      role: 'assistant'
      createdAt: new Date('2024-01-01T11:35:00Z')
    };

    const pairs: [MemoryPair, MemoryPair] = [
      { id: 'mem-1', summary: '用户询问了关于 openclaw 的架构设计', role: 'user', createdAt: new Date('2024-01-01T10:00:00Z') },
      { id: 'mem-2', summary: 'Claude解释了 Vue.js 的特性', role: 'user', createdAt: new Date('2024-01-01T11:30:00Z') },
      { id: 'mem-3', summary: 'mem-3', role: 'user', createdAt: new Date('2024-01-01T11:30:00Z') },
      { id: 'mem-4', summary: 'Claude解释了 Vue.js 的特性', role: 'assistant', createdAt: new Date('2024-01-01T11:35:00Z') },
      { id: 'mem-5', summary: 'Claude解释了 Vue.js 的特性', role: 'user', createdAt: new Date('2024-01-01T11:35:00Z') },
      { id: 'mem-6', summary: 'Claude解释了 Vue.js 的特性', role: 'assistant', createdAt: new Date('2024-01-01T11:35:00Z') },
      { id: 'mem-7', summary: 'Claude解释了 Vue.js 的特性', role: 'assistant', createdAt: new Date('2024-01-01T11:35:00Z') },
      { id: 'mem-8', summary: 'Claude解释了 Vue.js 的特性', role: 'assistant', createdAt: new Date('2024-01-01T11:35:00Z')
    ];

    const results = await deduplicator.batchCheck(pairs);
    expect(results.size).toBe(5);
    expect(mockGenerate).toHaveBeenCalledTimes(5);
    }
  });
});
