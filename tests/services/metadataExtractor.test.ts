import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetadataExtractor } from '../../src/services/metadataExtractor.js';
import * as llmModule from '../../src/config/llm.js';

describe('MetadataExtractor', () => {
  let extractor: MetadataExtractor;

  beforeEach(() => {
    vi.restoreAllMocks();
    extractor = new MetadataExtractor();
  });

  it('should extract metadata from content', async () => {
    const content = '用户讨论了 React Hooks 的使用，包括 useState 和 useEffect';
    const result = await extractor.extract(content);

    expect(result).toHaveProperty('tags');
    expect(result).toHaveProperty('keywords');
    expect(result).toHaveProperty('subjects');
    expect(result).toHaveProperty('importance');
    expect(result).toHaveProperty('summary');
  });

  it('should call LLM and parse response', async () => {
    const mockLLMResponse = JSON.stringify({
      tags: ['技术/前端/React'],
      keywords: ['useState', 'useEffect'],
      subjects: ['React Hooks'],
      importance: 0.8,
      summary: '讨论 React Hooks 使用'
    });

    // Mock LLM call
    vi.spyOn(llmModule, 'generateSummaryWithLLM').mockResolvedValue(mockLLMResponse);

    const result = await extractor.extract('讨论 React Hooks');
    expect(result.tags).toContain('技术/前端/React');
  });
});
