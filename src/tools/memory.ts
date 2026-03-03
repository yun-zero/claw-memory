import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';

export function registerMemoryTools(
  tools: any,
  db: Database,
  dataDir: string
) {
  // 解析 dataDir 中的 ~
  const resolvedDataDir = dataDir.replace(/^~/, homedir());

  // memory_save tool
  tools.register({
    name: 'memory_save',
    description: 'Save conversation to memory with metadata',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Conversation content' },
        metadata: {
          type: 'object',
          properties: {
            tags: { type: 'array', items: { type: 'string' } },
            keywords: { type: 'array', items: { type: 'string' } },
            importance: { type: 'number', minimum: 0, maximum: 1 }
          }
        }
      },
      required: ['content']
    },
    handler: async (params: any) => {
      const { content, metadata = {} } = params;
      const memoryId = uuidv4();

      const memoriesDir = path.join(resolvedDataDir, 'memories');
      fs.mkdirSync(memoriesDir, { recursive: true });

      const contentPath = path.join(memoriesDir, `${memoryId}.md`);
      await fs.promises.writeFile(contentPath, content, 'utf-8');

      db.prepare(`
        INSERT INTO memories (id, content_path, summary, importance, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(
        memoryId,
        contentPath,
        metadata.summary || content.substring(0, 200),
        metadata.importance || 0.5
      );

      return { success: true, memory_id: memoryId };
    }
  });

  // memory_search tool
  tools.register({
    name: 'memory_search',
    description: 'Search memories by query',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number', default: 10 }
      },
      required: ['query']
    },
    handler: async (params: any) => {
      const { query, limit = 10 } = params;
      const memories = db.prepare(`
        SELECT id, summary, importance, created_at
        FROM memories
        WHERE summary LIKE ?
        ORDER BY importance DESC
        LIMIT ?
      `).all(`%${query}%`, limit);

      return { memories };
    }
  });

  // memory_summary tool
  tools.register({
    name: 'memory_summary',
    description: 'Get memory summary for time period',
    schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['day', 'week', 'month'] },
        date: { type: 'string' }
      },
      required: ['period']
    },
    handler: async (params: any) => {
      const { period } = params;
      const today = new Date();
      let startDate: Date;

      switch (period) {
        case 'day':
          startDate = today;
          break;
        case 'week':
          startDate = new Date(today);
          startDate.setDate(today.getDate() - today.getDay());
          break;
        case 'month':
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          break;
        default:
          startDate = today;
      }

      const startDateStr = startDate.toISOString().split('T')[0];

      const memories = db.prepare(`
        SELECT summary, importance, created_at
        FROM memories
        WHERE created_at >= ?
        ORDER BY importance DESC
        LIMIT 20
      `).all(startDateStr);

      return {
        period,
        count: memories.length,
        memories: memories.slice(0, 10)
      };
    }
  });
}
