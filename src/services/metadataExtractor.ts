import { generateSummaryWithLLM } from '../config/llm.js';
import type { IntegratedSummary } from '../types.js';

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

  async callLLM(prompt: string): Promise<ExtractedMetadata> {
    const response = await generateSummaryWithLLM(prompt);
    return this.parseLLMResponse(response);
  }

  private parseLLMResponse(response: string): ExtractedMetadata {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch {}
    return this.fallbackExtract('');
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
