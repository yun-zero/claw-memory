/**
 * Embedding Service Module
 * Generates text embeddings using OpenAI-compatible APIs
 */

export interface EmbeddingConfig {
  format: 'openai' | 'anthropic' | 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
  dimension: number;
}

const DEFAULT_CONFIG: Partial<EmbeddingConfig> = {
  model: 'text-embedding-3-small',
  dimension: 1536,
};

function getEmbeddingConfig(override?: Partial<EmbeddingConfig>): EmbeddingConfig {
  const format = override?.format || (process.env.LLM_FORMAT as EmbeddingConfig['format']) || 'openai';
  const baseUrl = override?.baseUrl || process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = override?.apiKey || process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const model = override?.model || process.env.EMBEDDING_MODEL || DEFAULT_CONFIG.model!;
  const dimension = override?.dimension || DEFAULT_CONFIG.dimension!;

  if (!apiKey) {
    throw new Error('No API key configured. Set LLM_API_KEY or OPENAI_API_KEY environment variable.');
  }

  return { format, baseUrl, apiKey, model, dimension };
}

export async function generateEmbedding(
  text: string,
  config?: Partial<EmbeddingConfig>
): Promise<number[]> {
  const embeddingConfig = getEmbeddingConfig(config);

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
    data: { embedding: number[] }[];
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
