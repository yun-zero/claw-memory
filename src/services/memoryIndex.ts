import Database from 'better-sqlite3';
import { TodoRepository } from '../db/todoRepository.js';
import { MemoryRepository } from '../db/repository.js';
import { EntityRepository } from '../db/entityRepository.js';

export interface MemoryIndexOptions {
  period: 'day' | 'week' | 'month';
  date?: string;
  includeTodos?: boolean;
  includeRecent?: boolean;
  recentLimit?: number;
}

export interface MemoryIndex {
  period: { start: string; end: string };
  activeAreas: {
    tags: { name: string; count: number }[];
    keywords: string[];
  };
  todos: { id: string; content: string; period: string }[];
  recentActivity: { date: string; summary: string }[];
}

export async function getMemoryIndex(db: Database.Database, options: MemoryIndexOptions): Promise<MemoryIndex> {
  const { startDate, endDate } = calculatePeriodRange(options.period, options.date);

  // 并行获取活跃领域
  const [tags, keywords] = await Promise.all([
    Promise.resolve(getTopTags(db, startDate, endDate, 10)),
    Promise.resolve(getTopKeywords(db, startDate, endDate, 10))
  ]);

  // 并行获取待办和最近动态
  const [todos, recentActivity] = await Promise.all([
    options.includeTodos
      ? getTodos(db, options.period, endDate)
      : Promise.resolve([]),
    options.includeRecent
      ? getRecentActivity(db, startDate, endDate, options.recentLimit || 5)
      : Promise.resolve([])
  ]);

  return {
    period: { start: startDate, end: endDate },
    activeAreas: { tags, keywords },
    todos,
    recentActivity
  };
}

async function getTodos(db: Database.Database, period: string, endDate: string) {
  const todoRepo = new TodoRepository(db);
  const allTodos = todoRepo.findByPeriod(period, endDate);
  return allTodos
    .filter(t => !t.completedAt)
    .map(t => ({ id: t.id, content: t.content, period: t.period }));
}

async function getRecentActivity(db: Database.Database, startDate: string, endDate: string, limit: number) {
  const recentMemories = findMemoriesByDateRange(db, startDate, endDate, limit);
  return recentMemories.map(m => ({
    date: m.createdAt.toISOString().split('T')[0],
    summary: m.summary || ''
  }));
}

function calculatePeriodRange(period: string, date?: string) {
  const endDate = date || new Date().toISOString().split('T')[0];
  const startDate = new Date(endDate);

  switch (period) {
    case 'day': break;
    case 'week': startDate.setDate(startDate.getDate() - 7); break;
    case 'month': startDate.setMonth(startDate.getMonth() - 1); break;
  }

  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate
  };
}

function getTopTags(db: Database.Database, startDate: string, endDate: string, limit: number) {
  const rows = db.prepare(`
    SELECT e.name, COUNT(me.memory_id) as count
    FROM memory_entities me
    JOIN entities e ON me.entity_id = e.id
    JOIN memories m ON me.memory_id = m.id
    WHERE e.type = 'tag' AND date(m.created_at) BETWEEN ? AND ?
    GROUP BY e.id ORDER BY count DESC LIMIT ?
  `).all(startDate, endDate, limit) as { name: string; count: number }[];

  return rows;
}

function getTopKeywords(db: Database.Database, startDate: string, endDate: string, limit: number) {
  const rows = db.prepare(`
    SELECT e.name FROM memory_entities me
    JOIN entities e ON me.entity_id = e.id
    JOIN memories m ON me.memory_id = m.id
    WHERE e.type = 'keyword' AND date(m.created_at) BETWEEN ? AND ?
    GROUP BY e.id ORDER BY COUNT(*) DESC LIMIT ?
  `).all(startDate, endDate, limit) as { name: string }[];
  return rows.map(r => r.name);
}

interface MemoryRow {
  id: string;
  contentPath: string;
  summary: string | null;
  createdAt: Date;
  importance: number;
}

function findMemoriesByDateRange(db: Database.Database, startDate: string, endDate: string, limit: number): MemoryRow[] {
  const rows = db.prepare(`
    SELECT id, content_path, summary, created_at, importance
    FROM memories
    WHERE date(created_at) BETWEEN ? AND ?
    ORDER BY created_at DESC
    LIMIT ?
  `).all(startDate, endDate, limit) as any[];

  return rows.map(row => ({
    id: row.id,
    contentPath: row.content_path,
    summary: row.summary,
    createdAt: new Date(row.created_at),
    importance: row.importance
  }));
}
