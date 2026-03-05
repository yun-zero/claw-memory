/**
 * Embedding Service Module (Legacy)
 * 注意: 向量功能已移除，此模块仅保留基础配置接口
 * 如需使用LLM功能，请通过OpenClaw原生配置获取
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

/**
 * 获取当前 LLM 配置
 */
export function getLLMConfig(): { baseUrl: string; apiKey: string; model?: string } | null {
  return _llmConfig;
}

/**
 * 生成单个 embedding - 已废弃
 * @deprecated 向量功能已移除
 */
export async function generateEmbedding(
  text: string,
  _config?: Partial<EmbeddingConfig>
): Promise<number[]> {
  console.warn('[Embedding] generateEmbedding is deprecated. Vector features have been removed.');
  return [];
}

/**
 * 批量生成 embeddings - 已废弃
 * @deprecated 向量功能已移除
 */
export async function generateEmbeddings(
  texts: string[],
  _config?: Partial<EmbeddingConfig>
): Promise<number[][]> {
  console.warn('[Embedding] generateEmbeddings is deprecated. Vector features have been removed.');
  return texts.map(() => []);
}

// Cosine similarity - 已废弃
export function cosineSimilarity(_a: number[], _b: number[]): number {
  console.warn('[Embedding] cosineSimilarity is deprecated. Vector features have been removed.');
  return 0;
}

// Vector normalization - 已废弃
export function normalizeVector(_v: number[]): number[] {
  console.warn('[Embedding] normalizeVector is deprecated. Vector features have been removed.');
  return [];
}
