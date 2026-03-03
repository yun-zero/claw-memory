/**
 * Memory Summarizer Service
 * Aggregates memory data for weekly report generation
 */

import Database from 'better-sqlite3';
import type { Memory, WeeklyReport } from '../types.js';
import { generateSummaryWithLLM } from '../config/llm.js';

export class SummarizerService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  async aggregateMemories(startDate: string, endDate: string): Promise<WeeklyReport> {
    // 1. 基础统计 - 查询指定日期范围的 memories
    const basicStats = this.getBasicStats(startDate, endDate);

    // 2. 标签分布 - 查询 memory_entities + entities (type='tag')
    const tagStats = this.getTagStats(startDate, endDate);

    // 3. 关键词 - 查询 memory_entities + entities (type='keyword')
    const keywordStats = this.getKeywordStats(startDate, endDate);

    // 4. 重要性分组 - 按 importance 分组
    const importanceStats = this.getImportanceStats(startDate, endDate);

    // 5. 访问模式 - 按 access_count 和时间排序
    const accessStats = this.getAccessStats(startDate, endDate);

    // 6. 实体关系 - 查询 entity_relations
    const entityStats = this.getEntityStats(startDate, endDate);

    return {
      period: { start: startDate, end: endDate },
      basic: basicStats,
      tags: tagStats,
      topics: keywordStats,
      importance: importanceStats,
      access: accessStats,
      entities: entityStats,
      summary: '' // Will be filled by LLM
    };
  }

  private getBasicStats(startDate: string, endDate: string): WeeklyReport['basic'] {
    const stmt = this.db.prepare(`
      SELECT
        COUNT(*) as totalMemories,
        COALESCE(SUM(token_count), 0) as totalTokens,
        COALESCE(AVG(importance), 0) as avgImportance
      FROM memories
      WHERE date(created_at) >= date(?)
        AND date(created_at) <= date(?)
    `);

    const result = stmt.get(startDate, endDate) as {
      totalMemories: number;
      totalTokens: number;
      avgImportance: number;
    };

    return {
      totalMemories: result.totalMemories || 0,
      totalTokens: result.totalTokens || 0,
      avgImportance: parseFloat((result.avgImportance || 0).toFixed(2))
    };
  }

  private getTagStats(startDate: string, endDate: string): WeeklyReport['tags'] {
    // Get all tags with their counts in the date range
    const stmt = this.db.prepare(`
      SELECT e.name, COUNT(me.memory_id) as count
      FROM memory_entities me
      JOIN entities e ON me.entity_id = e.id
      JOIN memories m ON me.memory_id = m.id
      WHERE e.type = 'tag'
        AND date(m.created_at) >= date(?)
        AND date(m.created_at) <= date(?)
      GROUP BY e.id, e.name
      ORDER BY count DESC
      LIMIT 20
    `);

    const tags = stmt.all(startDate, endDate) as { name: string; count: number }[];

    // Build distribution map
    const tagDistribution: Record<string, number> = {};
    for (const tag of tags) {
      tagDistribution[tag.name] = tag.count;
    }

    return {
      topTags: tags.slice(0, 10),
      tagDistribution
    };
  }

  private getKeywordStats(startDate: string, endDate: string): WeeklyReport['topics'] {
    const stmt = this.db.prepare(`
      SELECT e.name, COUNT(me.memory_id) as count
      FROM memory_entities me
      JOIN entities e ON me.entity_id = e.id
      JOIN memories m ON me.memory_id = m.id
      WHERE e.type = 'keyword'
        AND date(m.created_at) >= date(?)
        AND date(m.created_at) <= date(?)
      GROUP BY e.id, e.name
      ORDER BY count DESC
      LIMIT 30
    `);

    const keywordsRaw = stmt.all(startDate, endDate) as { name: string; count: number }[];

    // Map to expected format with 'word' field
    const keywords = keywordsRaw.map(k => ({ word: k.name, count: k.count }));

    // Extract key topics (top 5 most frequent)
    const keyTopics = keywordsRaw.slice(0, 5).map(k => k.name);

    return {
      keywords,
      keyTopics
    };
  }

  private getImportanceStats(startDate: string, endDate: string): WeeklyReport['importance'] {
    const stmt = this.db.prepare(`
      SELECT id, summary, importance
      FROM memories
      WHERE date(created_at) >= date(?)
        AND date(created_at) <= date(?)
    `);

    const memories = stmt.all(startDate, endDate) as Pick<Memory, 'id' | 'summary' | 'importance'>[];

    const highPriority: Pick<Memory, 'id' | 'summary' | 'importance'>[] = [];
    const mediumPriority: Pick<Memory, 'id' | 'summary' | 'importance'>[] = [];
    const lowPriority: Pick<Memory, 'id' | 'summary' | 'importance'>[] = [];

    for (const memory of memories) {
      if (memory.importance > 0.7) {
        highPriority.push(memory);
      } else if (memory.importance > 0.3) {
        mediumPriority.push(memory);
      } else {
        lowPriority.push(memory);
      }
    }

    return { highPriority, mediumPriority, lowPriority };
  }

  private getAccessStats(startDate: string, endDate: string): WeeklyReport['access'] {
    // Most accessed
    const mostAccessedStmt = this.db.prepare(`
      SELECT id, summary, access_count
      FROM memories
      WHERE date(created_at) >= date(?)
        AND date(created_at) <= date(?)
      ORDER BY access_count DESC
      LIMIT 5
    `);
    const mostAccessed = mostAccessedStmt.all(startDate, endDate) as Pick<Memory, 'id' | 'summary' | 'accessCount'>[];

    // Recently created
    const recentlyCreatedStmt = this.db.prepare(`
      SELECT id, summary, created_at
      FROM memories
      WHERE date(created_at) >= date(?)
        AND date(created_at) <= date(?)
      ORDER BY created_at DESC
      LIMIT 5
    `);
    const recentlyCreated = recentlyCreatedStmt.all(startDate, endDate) as Pick<Memory, 'id' | 'summary' | 'createdAt'>[];

    // Recently accessed
    const recentlyAccessedStmt = this.db.prepare(`
      SELECT id, summary, last_accessed_at
      FROM memories
      WHERE date(created_at) >= date(?)
        AND date(created_at) <= date(?)
        AND last_accessed_at IS NOT NULL
      ORDER BY last_accessed_at DESC
      LIMIT 5
    `);
    const recentlyAccessed = recentlyAccessedStmt.all(startDate, endDate) as Pick<Memory, 'id' | 'summary' | 'lastAccessedAt'>[];

    return { mostAccessed, recentlyCreated, recentlyAccessed };
  }

  private getEntityStats(startDate: string, endDate: string): WeeklyReport['entities'] {
    // Get related entities from entity_relations
    const relatedStmt = this.db.prepare(`
      SELECT e1.name as entity, GROUP_CONCAT(e2.name) as related
      FROM entity_relations er
      JOIN entities e1 ON er.source_id = e1.id
      JOIN entities e2 ON er.target_id = e2.id
      WHERE er.relation_type IN ('related', 'similar', 'co_occur')
      GROUP BY e1.id, e1.name
      LIMIT 10
    `);
    const relatedResults = relatedStmt.all() as { entity: string; related: string }[];

    const relatedGroups = relatedResults.map(r => ({
      entity: r.entity,
      related: r.related ? r.related.split(',') : []
    }));

    // Get co-occurring tags
    const coOccurStmt = this.db.prepare(`
      SELECT e1.name as tag1, e2.name as tag2, COUNT(*) as count
      FROM memory_entities me1
      JOIN memory_entities me2 ON me1.memory_id = me2.memory_id AND me1.entity_id < me2.entity_id
      JOIN entities e1 ON me1.entity_id = e1.id
      JOIN entities e2 ON me2.entity_id = e2.id
      JOIN memories m ON me1.memory_id = m.id
      WHERE e1.type = 'tag' AND e2.type = 'tag'
        AND date(m.created_at) >= date(?)
        AND date(m.created_at) <= date(?)
      GROUP BY e1.id, e2.id
      ORDER BY count DESC
      LIMIT 10
    `);
    const coOccurring = coOccurStmt.all(startDate, endDate) as { tag1: string; tag2: string }[];

    const coOccurringTags: [string, string][] = coOccurring.map(c => [c.tag1, c.tag2]);

    return { relatedGroups, coOccurringTags };
  }

  reportToString(report: WeeklyReport): string {
    const lines: string[] = [];

    lines.push(`📊 周报期间: ${report.period.start} 至 ${report.period.end}`);
    lines.push('');
    lines.push('## 基础统计');
    lines.push(`- 记忆总数: ${report.basic.totalMemories}`);
    lines.push(`- 总 Token 数: ${report.basic.totalTokens}`);
    lines.push(`- 平均重要性: ${report.basic.avgImportance}`);
    lines.push('');

    if (report.tags.topTags.length > 0) {
      lines.push('## 热门标签');
      for (const tag of report.tags.topTags.slice(0, 5)) {
        lines.push(`- ${tag.name}: ${tag.count} 条`);
      }
      lines.push('');
    }

    if (report.topics.keyTopics.length > 0) {
      lines.push('## 关键主题');
      lines.push(report.topics.keyTopics.join(', '));
      lines.push('');
    }

    if (report.importance.highPriority.length > 0) {
      lines.push('## 高优先级记忆');
      for (const m of report.importance.highPriority.slice(0, 3)) {
        lines.push(`- ${m.summary?.substring(0, 50) || '无摘要'}... (重要性: ${m.importance})`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Generate weekly summary using LLM
   */
  async generateWeeklySummary(report: {
    period: string;
    startDate: string;
    endDate: string;
    memoryCount: number;
    memories?: string[];
  }): Promise<string> {
    const stats = await this.aggregateMemories(report.startDate, report.endDate);
    const statsString = this.reportToString(stats);

    let prompt = `请为以下周报数据生成一个简洁的中文摘要（100-200字）：\n\n${statsString}`;

    if (report.memories && report.memories.length > 0) {
      prompt += `\n\n## 本周重要记忆内容：\n${report.memories.join('\n---\n')}`;
    }

    return await generateSummaryWithLLM(prompt);
  }

  /**
   * Generate monthly summary using LLM
   */
  async generateMonthlySummary(report: {
    period: string;
    startDate: string;
    endDate: string;
    memoryCount: number;
    memories?: string[];
  }): Promise<string> {
    const stats = await this.aggregateMemories(report.startDate, report.endDate);
    const statsString = this.reportToString(stats);

    let prompt = `请为以下月报数据生成一个简洁的中文摘要（150-300字）：\n\n${statsString}`;

    if (report.memories && report.memories.length > 0) {
      prompt += `\n\n## 本月重要记忆内容：\n${report.memories.join('\n---\n')}`;
    }

    return await generateSummaryWithLLM(prompt);
  }
}

/**
 * Alias for SummarizerService for backwards compatibility
 */
export { SummarizerService as Summarizer };
