/**
 * Claw-Memory Type Definitions
 * Lightweight AI memory system for OpenClaw and Claude Code
 */

export interface IntegratedSummary {
  active_areas: string[];
  key_topics: string[];
  recent_summary: string;
}

export interface Memory {
  id: string;
  contentPath: string;
  summary: string | null;
  integratedSummary: IntegratedSummary | null;
  createdAt: Date;
  updatedAt: Date;
  tokenCount: number;
  importance: number;
  accessCount: number;
  lastAccessedAt: Date | null;
  isArchived: boolean;
  isDuplicate: boolean;
  duplicateOf: string | null;
}

export interface Entity {
  id: string;
  name: string;
  type: 'keyword' | 'tag' | 'subject' | 'person' | 'project';
  parentId: string | null;
  level: number;
  embedding: Buffer | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export interface MemoryEntity {
  memoryId: string;
  entityId: string;
  relevance: number;
  source: 'auto' | 'manual';
  createdAt: Date;
}

export interface EntityRelation {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: 'related' | 'parent' | 'similar' | 'co_occur';
  weight: number;
  evidenceCount: number;
  createdAt: Date;
}

export interface TimeBucket {
  date: string; // YYYY-MM-DD
  memoryCount: number;
  summary: string | null;
  summaryGeneratedAt: Date | null;
  keyTopics: string[] | null;
  createdAt: Date;
}

export interface SaveMemoryInput {
  content: string;
  metadata: {
    tags?: string[];
    subjects?: string[];
    keywords?: string[];
    importance?: number;
    summary?: string;
  };
  userId?: string;
}

export interface SearchMemoryInput {
  query: string;
  timeRange?: 'today' | 'week' | 'month' | 'year' | 'all';
  tags?: string[];
  limit?: number;
  maxTokens?: number;
}

export interface GetContextInput {
  query: string;
  maxTokens?: number;
}

export interface GetSummaryInput {
  period: 'day' | 'week' | 'month';
  date?: string;
}

export interface WeeklyReport {
  // 1. 基础统计
  period: { start: string; end: string };
  basic: {
    totalMemories: number;
    totalTokens: number;
    avgImportance: number;
  };

  // 2. 标签分布维度
  tags: {
    topTags: { name: string; count: number }[];
    tagDistribution: Record<string, number>;
  };

  // 3. 主题/关键词维度
  topics: {
    keywords: { word: string; count: number }[];
    keyTopics: string[];
  };

  // 4. 重要性维度
  importance: {
    highPriority: Pick<Memory, 'id' | 'summary' | 'importance'>[];
    mediumPriority: Pick<Memory, 'id' | 'summary' | 'importance'>[];
    lowPriority: Pick<Memory, 'id' | 'summary' | 'importance'>[];
  };

  // 5. 访问模式维度
  access: {
    mostAccessed: Pick<Memory, 'id' | 'summary' | 'accessCount'>[];
    recentlyCreated: Pick<Memory, 'id' | 'summary' | 'createdAt'>[];
    recentlyAccessed: Pick<Memory, 'id' | 'summary' | 'lastAccessedAt'>[];
  };

  // 6. 实体关系维度
  entities: {
    relatedGroups: { entity: string; related: string[] }[];
    coOccurringTags: [string, string][];
  };

  // 7. LLM 智能总结
  summary: string;
}
