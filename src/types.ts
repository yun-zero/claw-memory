/**
 * Claw-Memory Type Definitions
 * Lightweight AI memory system for OpenClaw and Claude Code
 */

export type InternalHookHandler = (event: any) => Promise<void> | void;

// OpenClaw InternalHookEvent 结构
export interface InternalHookEvent {
  type?: string;
  action?: string;
  sessionKey?: string;
  context?: Record<string, unknown>;
  timestamp?: Date;
  messages?: string[];
}

// 实体类型
export type EntityType = 'keyword' | 'tag' | 'subject' | 'person' | 'project';

// 关系类型
export type RelationType = 'related' | 'parent' | 'similar' | 'co_occur';

// 时间周期
export type TimePeriod = 'day' | 'week' | 'month' | 'year' | 'all';

// 实体来源
export type EntitySource = 'auto' | 'manual';

// 记忆角色
export type MemoryRole = 'user' | 'assistant';

// 摘要配置
export interface SummaryConfig {
  maxLength: number;
  minLength: number;
}

// 集成摘要
export interface IntegratedSummary {
  active_areas: string[];
  key_topics: string[];
  recent_summary: string;
}

// 记忆类型
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
  role: MemoryRole;
  contentHash?: string;
}

// 实体
export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  parentId: string | null;
  level: number;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

// 记忆-实体关联
export interface MemoryEntity {
  memoryId: string;
  entityId: string;
  relevance: number;
  source: EntitySource;
  createdAt: Date;
}

// 实体关系
export interface EntityRelation {
  id: string;
  sourceId: string;
  targetId: string;
  relationType: RelationType;
  weight: number;
  evidenceCount: number;
  createdAt: Date;
}

// 时间桶
export interface TimeBucket {
  date: string; // YYYY-MM-DD
  memoryCount: number;
  summary: string | null;
  summaryGeneratedAt: Date | null;
  keyTopics: string[] | null;
  createdAt: Date;
}

// 待办事项
export interface Todo {
  id: string;
  content: string;
  period: TimePeriod;
  periodDate: string;
  createdAt: Date;
  completedAt: Date | null;
  memoryId: string | null;
}

// 保存记忆输入
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

// 搜索记忆输入
export interface SearchMemoryInput {
  query: string;
  timeRange?: TimePeriod;
  tags?: string[];
  limit?: number;
  maxTokens?: number;
}

// 获取上下文输入
export interface GetContextInput {
  query: string;
  maxTokens?: number;
}

// 获取摘要输入
export interface GetSummaryInput {
  period: TimePeriod;
  date?: string;
}

// 周报
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

// 插件配置
export interface PluginConfig {
  enabled: boolean;
  autoSave: boolean;
  dataDir: string;
  maxContextMemories: number;
}

// 搜索结果
export interface SearchResult {
  id: string;
  summary: string | null;
  role: MemoryRole;
  createdAt: Date;
  entityNames?: string[];
  matchType?: 'keyword' | 'text';
}

// 索引信息
export interface MemoryIndex {
  activeAreas: {
    tags: { name: string; count: number }[];
    keywords: { name: string; count: number }[];
  };
  recentActivity: {
    date: string;
    summary: string;
    role: MemoryRole;
  }[];
  todos: Todo[];
}

// 元数据提取结果
export interface MetadataExtractionResult {
  tags: string[];
  keywords: string[];
  subjects: string[];
}
