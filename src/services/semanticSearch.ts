import { getDatabase } from '../db/schema.js';
import { generateEmbedding, cosineSimilarity } from './embedding.js';

// 向量搜索功能开关 - 可通过环境变量控制
const VECTOR_SEARCH_ENABLED = process.env.CLAW_MEMORY_VECTOR !== 'false';

export interface Memory {
  id: string;
  summary: string;
  role: string;
  created_at: string;
  embedding?: number[];
}

export interface SearchResult extends Memory {
  relevanceScore: number;
  matchType: 'keyword' | 'semantic' | 'both';
}

// 语义搜索 - 仅基于向量相似度
export async function semanticSearch(
  query: string,
  limit: number = 10
): Promise<SearchResult[]> {
  // 如果向量搜索被禁用，返回空结果
  if (!VECTOR_SEARCH_ENABLED) {
    console.log('[SemanticSearch] Vector search disabled, returning empty results');
    return [];
  }

  const db = getDatabase();

  // 1. 生成查询向量
  const queryEmbedding = await generateEmbedding(query);

  // 2. 获取所有有向量的实体关联记忆
  const memories = db.prepare(`
    SELECT m.id, m.summary, m.role, m.created_at, e.embedding
    FROM memories m
    LEFT JOIN memory_entities me ON m.id = me.memory_id
    LEFT JOIN entities e ON me.entity_id = e.id
    WHERE e.embedding IS NOT NULL
    GROUP BY m.id
  `).all() as any[];

  // 3. 计算相似度并排序
  const results: SearchResult[] = memories
    .map(memory => {
      const embedding = memory.embedding ? JSON.parse(memory.embedding) : null;
      const similarity = embedding
        ? cosineSimilarity(queryEmbedding, embedding)
        : 0;
      return {
        id: memory.id,
        summary: memory.summary,
        role: memory.role,
        created_at: memory.created_at,
        relevanceScore: similarity,
        matchType: 'semantic' as const,
      };
    })
    .filter(r => r.relevanceScore > 0.3)  // 阈值过滤
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);

  return results;
}

// 混合搜索 - 关键词 + 语义
export async function hybridSearch(
  query: string,
  limit: number = 10,
  keywordWeight: number = 0.5,
  semanticWeight: number = 0.5
): Promise<SearchResult[]> {
  const db = getDatabase();

  // 1. 关键词搜索
  const keywords = query.split(/\s+/).filter(k => k.length > 0);
  const keywordParams = keywords.map(k => `%${k}%`);
  const conditions = keywords.map(() => "summary LIKE ?").join(" OR ");

  const keywordResults = db.prepare(`
    SELECT id, summary, role, created_at
    FROM memories
    WHERE ${conditions}
    ORDER BY created_at DESC
    LIMIT ?
  `).all(...keywordParams, limit) as Memory[];

  const keywordMatches = keywordResults.map(m => ({
    ...m,
    relevanceScore: 1,
    matchType: 'keyword' as const,
  }));

  // 2. 语义搜索
  const semanticMatches = await semanticSearch(query, limit);

  // 3. 合并结果
  const merged = new Map<string, SearchResult>();

  for (const r of keywordMatches) {
    merged.set(r.id, { ...r, relevanceScore: r.relevanceScore * keywordWeight });
  }

  for (const r of semanticMatches) {
    if (merged.has(r.id)) {
      const existing = merged.get(r.id)!;
      existing.matchType = 'both';
      existing.relevanceScore += r.relevanceScore * semanticWeight;
    } else {
      merged.set(r.id, { ...r, relevanceScore: r.relevanceScore * semanticWeight });
    }
  }

  // 4. 排序返回
  return Array.from(merged.values())
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit);
}
