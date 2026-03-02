import { generateSummaryWithLLM } from '../config/llm.js';

export interface ExtractedMetadata {
  tags: string[];
  keywords: string[];
  subjects: string[];
  importance: number;
  summary: string;
}

const EXTRACTION_PROMPT = `请从以下对话内容中提取结构化元数据：

内容：{content}

请以 JSON 格式返回：
{
  "tags": ["一级分类/二级分类/三级分类"],
  "keywords": ["关键词1", "关键词2"],
  "subjects": ["主题1", "主题2"],
  "importance": 0.0-1.0,
  "summary": "一句话摘要"
}

注意：
- tags 使用层级结构，如 "技术/前端/React"
- importance 表示内容重要性，0.0-1.0
- 只返回 JSON，不要其他内容`;

export class MetadataExtractor {
  async extract(content: string): Promise<ExtractedMetadata> {
    const prompt = EXTRACTION_PROMPT.replace('{content}', content);

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
      summary: content.substring(0, 100)
    };
  }
}
