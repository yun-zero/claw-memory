/**
 * Embedding Service Module
 * Generates text embeddings using OpenAI-compatible APIs
 */

export interface EmbeddingConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

const DEFAULT_MODEL = 'text-embedding-v1';

// 存储 OpenClaw 传入的配置
let _llmConfig: { baseUrl: string; apiKey: string; model?: string } | null = null;

/**
 * 设置 OpenClaw 的 LLM 配置（由 plugin.ts 调用）
 */
export function setLLMConfig(config: { baseUrl: string; apiKey: string; model?: string }): void {
  _llmConfig = config;
  console.log('[Embedding] LLM config set:', { baseUrl: config.baseUrl, model: config.model || DEFAULT_MODEL });
}

function getEmbeddingConfig(override?: Partial<EmbeddingConfig>): EmbeddingConfig {
  // 使用 OpenClaw 传入的配置
  if (!_llmConfig) {
    throw new Error('LLM config not set. Please call setLLMConfig() first.');
  }

  // 根据 LLM baseUrl 推断 embedding 端点
  // 火山引擎: /v1/chat/completions -> /v1/embeddings
  // 其他: 直接使用 baseUrl
  let baseUrl = override?.baseUrl || _llmConfig.baseUrl;
  if (baseUrl.includes('/chat/')) {
    baseUrl = baseUrl.replace('/chat/completions', '/embeddings');
  } else if (!baseUrl.includes('/embeddings')) {
    baseUrl = baseUrl.replace('/v1', '/v1/embeddings').replace('/v3', '/v3/embeddings');
  }

  const apiKey = override?.apiKey || _llmConfig.apiKey;
  const model = override?.model || _llmConfig.model || DEFAULT_MODEL;

  if (!apiKey) {
    throw new Error('No API key configured.');
  }

  return { baseUrl, apiKey, model };
}

export async function generateEmbedding(
  text: string,
  config?: Partial<EmbeddingConfig>
): Promise<number[]> {
  const embeddingConfig = getEmbeddingConfig(config);

  console.log('[Embedding] Request:', {
    url: `${embeddingConfig.baseUrl}/embeddings`,
    model: embeddingConfig.model
  });

  const response = await fetch(`${embeddingConfig.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${embeddingConfig.apiKey}`
    },
    body: JSON.stringify({
      model: embeddingConfig.model,
      input: text
    })
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

// Batch generate embeddings
export async function generateEmbeddings(
  texts: string[],
  config?: Partial<EmbeddingConfig>
): Promise<number[][]> {
  const embeddingConfig = getEmbeddingConfig(config);

  const response = await fetch(`${embeddingConfig.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${embeddingConfig.apiKey}`
    },
    body: JSON.stringify({
      model: embeddingConfig.model,
      input: texts
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${error}`);
  }

  const data = await response.json() as {
    data: { index: number; embedding: number[] }[];
  };

  // Sort by index to ensure correct order
  const sortedData = data.data.sort((a, b) => a.index - b.index);
  return sortedData.map(item => item.embedding);
}

// Cosine similarity calculation
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

// Vector normalization
export function normalizeVector(v: number[]): number[] {
  const magnitude = Math.sqrt(v.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return v;
  return v.map(val => val / magnitude);
}

// Get embedding configuration (for external use)
export { getEmbeddingConfig };
