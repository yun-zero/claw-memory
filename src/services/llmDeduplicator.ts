/**
 * LLM Deduplicator Service
 * Uses LLM to semantically determine if two memories are duplicates
 */

import { generateSummaryWithLLM, getLLMConfig } from '../config/llm.js';

/**
 * Result of LLM deduplication check
 */
export interface DeduplicationResult {
  isDuplicate: boolean;
  reason: string;
  confidence: number;
}

/**
 * Memory pair for deduplication comparison
 */
export interface MemoryPair {
  id: string;
  summary: string;
  createdAt: Date;
}

/**
 * LlmDeduplicator Service Class
 */
export class LlmDeduplicator {
  /**
   * Checks if two memories are semantic duplicates
   */
  async checkDuplicate(mem1: MemoryPair, mem2: MemoryPair): Promise<DeduplicationResult> {
    const prompt = this.buildPrompt(mem1, mem2);

    try {
      const config = getLLMConfig();
      const response = await generateSummaryWithLLM(prompt, config);
      return this.parseResponse(response);
    } catch (error) {
      console.error('[LlmDeduplicator] LLM call failed:', error);
      return {
        isDuplicate: false,
        reason: `LLM call failed: ${error}`,
        confidence: 0
      };
    }
  }

  /**
   * Batch checks multiple memory pairs with concurrency control
   */
  async batchCheck(
    pairs: [MemoryPair, MemoryPair][],
    concurrency: number = 3
  ): Promise<Map<string, DeduplicationResult>> {
    const results = new Map<string, DeduplicationResult>();

    for (let i = 0; i < pairs.length; i += concurrency) {
      const batch = pairs.slice(i, i + concurrency);
      const batchPromises = batch.map(([mem1, mem2]) =>
        this.checkDuplicate(mem1, mem2).then(result => {
          const key = `${mem1.id}:${mem2.id}`;
          results.set(key, result);
        })
      );
      await Promise.all(batchPromises);
    }

    return results;
  }

  /**
   * Builds the prompt for duplicate detection
   */
  private buildPrompt(mem1: MemoryPair, mem2: MemoryPair): string {
    const time1 = mem1.createdAt.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    const time2 = mem2.createdAt.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const date1 = mem1.createdAt.toLocaleDateString('zh-CN');
    const date2 = mem2.createdAt.toLocaleDateString('zh-CN');

    return `你是一个智能助手，负责判断两条记忆是否是重复内容。

请仔细分析以下两条记忆，判断它们是否描述的是相同的核心信息或事件。

记忆 1:
时间: ${time1}
日期: ${date1}
内容: ${mem1.summary}

记忆 2:
时间: ${time2}
日期: ${date2}
内容: ${mem2.summary}

请以 JSON 格式回复：
{"isDuplicate": boolean, "reason": "简短理由", "confidence": 0.0-1.0}`;
  }

  /**
   * Parses LLM response into DeduplicationResult
   */
  private parseResponse(response: string): DeduplicationResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          isDuplicate: Boolean(parsed.isDuplicate),
          reason: String(parsed.reason || '未提供理由'),
          confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5))
        };
      }

      // Fallback: try to infer from response text
      const isDuplicate = response.includes('重复') || response.includes('duplicate');
      return {
        isDuplicate,
        reason: isDuplicate ? '响应表明是重复内容' : '无法从响应中解析',
        confidence: isDuplicate ? 0.7 : 0.3
      };
    } catch (error) {
      console.error('[LlmDeduplicator] Failed to parse response:', error);
      return {
        isDuplicate: false,
        reason: `解析失败: ${error}`,
        confidence: 0
      };
    }
  }
}
