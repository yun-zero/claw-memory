/**
 * Tests for SummarizerService
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SummarizerService } from '../../src/services/summarizer.js';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../../src/db/schema.js';

describe('SummarizerService', () => {
  let db: Database.Database;
  let summarizer: SummarizerService;

  beforeEach(() => {
    db = new Database(':memory:');
    initializeDatabase(db);
    summarizer = new SummarizerService(db);
  });

  it('should aggregate memories for a date range', async () => {
    // Create test memories
    const insertMemory = db.prepare(`
      INSERT INTO memories (id, content_path, summary, created_at, token_count, importance, access_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Insert memories with dates in range (2026-02-23 to 2026-03-01)
    insertMemory.run('m1', '/test/m1.md', 'React 组件开发笔记', '2026-02-24', 500, 0.8, 10);
    insertMemory.run('m2', '/test/m2.md', 'Node.js API 设计', '2026-02-25', 300, 0.6, 5);
    insertMemory.run('m3', '/test/m3.md', 'AI 项目开发总结', '2026-02-26', 800, 0.9, 20);
    insertMemory.run('m4', '/test/m4.md', '日常笔记', '2026-02-27', 100, 0.2, 1);

    // Insert tags
    const insertEntity = db.prepare(`
      INSERT INTO entities (id, name, type, level, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertMemoryEntity = db.prepare(`
      INSERT INTO memory_entities (memory_id, entity_id, relevance, source, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    // Add tags
    insertEntity.run('e1', '技术/前端/React', 'tag', 2, '2026-02-24');
    insertEntity.run('e2', '技术/后端/Node', 'tag', 2, '2026-02-24');
    insertEntity.run('e3', '项目/AI', 'tag', 1, '2026-02-24');
    insertEntity.run('e4', 'React', 'keyword', 0, '2026-02-24');
    insertEntity.run('e5', 'API', 'keyword', 0, '2026-02-24');

    // Link memories to tags/keywords
    insertMemoryEntity.run('m1', 'e1', 1.0, 'auto', '2026-02-24');
    insertMemoryEntity.run('m2', 'e2', 1.0, 'auto', '2026-02-24');
    insertMemoryEntity.run('m3', 'e3', 1.0, 'auto', '2026-02-24');
    insertMemoryEntity.run('m1', 'e4', 0.8, 'auto', '2026-02-24');
    insertMemoryEntity.run('m2', 'e5', 0.8, 'auto', '2026-02-24');

    const report = await summarizer.aggregateMemories('2026-02-23', '2026-03-01');

    // Check basic stats
    expect(report.basic.totalMemories).toBe(4);
    expect(report.basic.totalTokens).toBe(1700);
    expect(report.period.start).toBe('2026-02-23');
    expect(report.period.end).toBe('2026-03-01');

    // Check tags
    expect(report.tags.topTags.length).toBeGreaterThan(0);

    // Check importance grouping
    expect(report.importance.highPriority.length).toBe(2); // m1 (0.8), m3 (0.9)
    expect(report.importance.mediumPriority.length).toBe(1); // m2 (0.6)
    expect(report.importance.lowPriority.length).toBe(1); // m4 (0.2)

    // Check access stats
    expect(report.access.mostAccessed.length).toBeGreaterThan(0);
    expect(report.access.mostAccessed[0].id).toBe('m3'); // highest access count

    // Check keywords
    expect(report.topics.keywords.length).toBeGreaterThan(0);
    expect(report.topics.keyTopics.length).toBeGreaterThan(0);
  });

  it('should return empty report for date range with no memories', async () => {
    const report = await summarizer.aggregateMemories('2025-01-01', '2025-01-07');

    expect(report.basic.totalMemories).toBe(0);
    expect(report.basic.totalTokens).toBe(0);
    expect(report.tags.topTags.length).toBe(0);
  });

  it('should correctly convert report to string', async () => {
    const report = await summarizer.aggregateMemories('2026-02-23', '2026-03-01');

    const reportString = summarizer.reportToString(report);

    expect(reportString).toContain('周报期间');
    expect(reportString).toContain('基础统计');
    expect(reportString).toContain('记忆总数');
  });
});
