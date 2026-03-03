/**
 * LLM Configuration Module
 * Supports OpenAI and Anthropic API keys via environment variables
 */

export interface LLMConfig {
  format: 'openai' | 'anthropic' | 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function getLLMConfig(): LLMConfig {
  const format = (process.env.LLM_FORMAT as LLMConfig['format']) || 'openai';
  const baseUrl = process.env.LLM_BASE_URL || getDefaultBaseUrl(format);
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const model = process.env.LLM_MODEL || getDefaultModel(format);

  if (!apiKey) {
    throw new Error('No LLM API key configured. Set LLM_API_KEY environment variable.');
  }

  return { format, baseUrl, apiKey, model };
}

function getDefaultBaseUrl(format: LLMConfig['format']): string {
  switch (format) {
    case 'anthropic':
      return 'https://api.anthropic.com';
    case 'openai':
    case 'openai-compatible':
    default:
      return 'https://api.openai.com/v1';
  }
}

function getDefaultModel(format: LLMConfig['format']): string {
  switch (format) {
    case 'anthropic':
      return 'claude-3-haiku-20240307';
    case 'openai':
    case 'openai-compatible':
    default:
      return 'gpt-4o-mini';
  }
}

export async function generateSummaryWithLLM(
  report: string,
  config?: LLMConfig
): Promise<string> {
  const llmConfig = config || getLLMConfig();

  const systemPrompt = `你是一个智能助手，负责根据用户记忆数据生成周报总结。
请根据提供的统计数据，从多个维度分析用户的记忆内容，并生成一段简洁、有价值的自然语言总结。
总结应该：
1. 概括本周的记忆活动概况
2. 指出用户最关注的话题和标签
3. 识别重要的记忆内容
4. 给出有洞察力的观察

请用中文输出总结，保持简洁但有信息量。`;

  if (llmConfig.format === 'anthropic') {
    return generateWithAnthropic(systemPrompt, report, llmConfig);
  } else if (llmConfig.format === 'openai-compatible') {
    return generateWithOpenAICompatible(systemPrompt, report, llmConfig);
  } else {
    return generateWithOpenAI(systemPrompt, report, llmConfig);
  }
}

async function generateWithAnthropic(
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic API error: ${error}`);
  }

  const data = await response.json() as { content: { text: string }[] };
  return data.content[0]?.text || '总结生成失败';
}

async function generateWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${error}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content || '总结生成失败';
}

async function generateWithOpenAICompatible(
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Compatible API error: ${error}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content || '总结生成失败';
}
