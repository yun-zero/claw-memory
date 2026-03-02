/**
 * Claw-Memory Type Definitions
 * Lightweight AI memory system for OpenClaw and Claude Code
 */

export interface Memory {
  id: string;
  contentPath: string;
  summary: string | null;
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
