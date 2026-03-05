#!/usr/bin/env node

/**
 * ClawMemory CLI Tool
 * 用于手动管理记忆的标签、实体、摘要
 * 
 * 使用方法:
 *   node cli.js list [limit]           - 列出最近N条记忆
 *   node cli.js query <tag>            - 通过标签查询记忆
 *   node cli.js update <id> --tags a,b --summary "xxx"  - 更新记忆
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 使用OpenClaw默认数据目录
const dataDir = path.join(process.env.HOME || '/home/ubuntu', '.openclaw/claw-memory');
const dbPath = path.join(dataDir, 'memory.db');

// 确保目录存在
import fs from 'fs';
if (!fs.existsSync(dataDir)) {
  console.log('[INFO] Creating data directory:', dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
}

let db: Database.Database;

function initDb() {
  try {
    db = new Database(dbPath);
    console.log('[OK] Connected to database:', dbPath);
  } catch (err) {
    console.error('[ERROR] Failed to connect database:', err);
    process.exit(1);
  }
}

// 命令: list - 按时间查询最近N条记忆
function listCmd(limit = 10) {
  const memories = db.prepare(`
    SELECT m.id, m.summary, m.role, m.created_at,
           GROUP_CONCAT(DISTINCT e.name) as entities
    FROM memories m
    LEFT JOIN memory_entities me ON m.id = me.memory_id
    LEFT JOIN entities e ON me.entity_id = e.id
    GROUP BY m.id
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(limit) as any[];

  if (memories.length === 0) {
    console.log('No memories found.');
    return;
  }

  console.log(`\n=== Recent ${memories.length} Memories ===\n`);
  memories.forEach((m, i) => {
    const date = new Date(m.created_at).toLocaleString();
    const summary = m.summary ? m.summary.substring(0, 100) + (m.summary.length > 100 ? '...' : '') : '(无摘要)';
    const entities = m.entities ? m.entities : '(无实体)';
    
    console.log(`[${i + 1}] ${date}`);
    console.log(`    Role: ${m.role}`);
    console.log(`    Entities: ${entities}`);
    console.log(`    Summary: ${summary}`);
    console.log(`    ID: ${m.id}`);
    console.log('');
  });
}

// 命令: query - 通过标签或实体查询
function queryCmd(query: string) {
  const results = db.prepare(`
    SELECT m.id, m.summary, m.role, m.created_at,
           GROUP_CONCAT(DISTINCT e.name) as entities,
           COUNT(DISTINCT e.id) as match_count
    FROM memories m
    LEFT JOIN memory_entities me ON m.id = me.memory_id
    LEFT JOIN entities e ON me.entity_id = e.id
    WHERE e.name LIKE ?
    GROUP BY m.id
    ORDER BY match_count DESC, m.created_at DESC
    LIMIT 20
  `).all(`%${query}%`) as any[];

  if (results.length === 0) {
    console.log(`No memories found matching "${query}".`);
    return;
  }

  console.log(`\n=== Found ${results.length} memories for "${query}" ===\n`);
  results.forEach((m, i) => {
    const date = new Date(m.created_at).toLocaleString();
    const summary = m.summary ? m.summary.substring(0, 150) + (m.summary.length > 150 ? '...' : '') : '(无摘要)';
    
    console.log(`[${i + 1}] ${date} (${m.role})`);
    console.log(`    Entities: ${m.entities || '(无)'}`);
    console.log(`    Summary: ${summary}`);
    console.log(`    ID: ${m.id}`);
    console.log('');
  });
}

// 命令: update - 更新记忆的标签/实体/摘要
function updateCmd(memoryId: string, options: { tags?: string[], keywords?: string[], subjects?: string[], summary?: string }) {
  // 检查记忆是否存在
  const memory = db.prepare('SELECT id FROM memories WHERE id = ?').get(memoryId) as any;
  if (!memory) {
    console.error(`[ERROR] Memory not found: ${memoryId}`);
    return;
  }

  // 更新摘要
  if (options.summary) {
    db.prepare('UPDATE memories SET summary = ? WHERE id = ?').run(options.summary, memoryId);
    console.log('[OK] Updated summary');
  }

  // 删除旧的实体关联
  db.prepare('DELETE FROM memory_entities WHERE memory_id = ?').run(memoryId);

  // 重新添加实体
  const allEntities = [
    ...(options.tags || []).map((name, i) => ({ name, type: 'tag', relevance: 1.0 - i * 0.1 })),
    ...(options.keywords || []).map((name, i) => ({ name, type: 'keyword', relevance: 0.8 - i * 0.1 })),
    ...(options.subjects || []).map((name, i) => ({ name, type: 'subject', relevance: 0.9 - i * 0.1 }))
  ];

  for (const entity of allEntities) {
    // 查找或创建实体
    let ent = db.prepare('SELECT id FROM entities WHERE name = ? AND type = ?').get(entity.name, entity.type) as any;
    if (!ent) {
      const newId = crypto.randomUUID();
      db.prepare('INSERT INTO entities (id, name, type, level) VALUES (?, ?, ?, ?)').run(newId, entity.name, entity.type, 1);
      ent = { id: newId };
    }
    
    // 建立关联
    db.prepare(`
      INSERT INTO memory_entities (memory_id, entity_id, relevance, source)
      VALUES (?, ?, ?, 'manual')
    `).run(memoryId, ent.id, entity.relevance);
  }

  console.log('[OK] Updated entities:', allEntities.map(e => e.name).join(', '));
}

// 命令: tags - 列出所有标签
function tagsCmd() {
  const tags = db.prepare(`
    SELECT e.name, COUNT(me.memory_id) as count
    FROM entities e
    LEFT JOIN memory_entities me ON e.id = me.entity_id
    WHERE e.type = 'tag'
    GROUP BY e.id
    ORDER BY count DESC
    LIMIT 50
  `).all() as any[];

  if (tags.length === 0) {
    console.log('No tags found.');
    return;
  }

  console.log('\n=== All Tags ===\n');
  tags.forEach(t => {
    console.log(`  ${t.name} (${t.count})`);
  });
  console.log('');
}

// 主入口
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  initDb();

  switch (command) {
    case 'list':
      const limit = parseInt(args[1]) || 10;
      listCmd(limit);
      break;
      
    case 'query':
      if (!args[1]) {
        console.error('Usage: node cli.js query <tag>');
        process.exit(1);
      }
      queryCmd(args[1]);
      break;
      
    case 'update':
      if (!args[1]) {
        console.error('Usage: node cli.js update <memory-id> [--tags a,b] [--summary "xxx"]');
        process.exit(1);
      }
      const memoryId = args[1];
      const options: any = { tags: [], keywords: [], subjects: [] };
      
      // 解析参数
      for (let i = 2; i < args.length; i++) {
        if (args[i] === '--tags' && args[i + 1]) {
          options.tags = args[i + 1].split(',');
          i++;
        } else if (args[i] === '--keywords' && args[i + 1]) {
          options.keywords = args[i + 1].split(',');
          i++;
        } else if (args[i] === '--subjects' && args[i + 1]) {
          options.subjects = args[i + 1].split(',');
          i++;
        } else if (args[i] === '--summary' && args[i + 1]) {
          options.summary = args[i + 1];
          i++;
        }
      }
      
      updateCmd(memoryId, options);
      break;
      
    case 'tags':
      tagsCmd();
      break;
      
    case 'help':
    default:
      console.log(`
ClawMemory CLI Tool

Usage:
  node cli.js list [limit]              List recent memories (default: 10)
  node cli.js query <tag>               Query memories by tag/entity
  node cli.js update <id> [options]    Update memory tags/summary
  node cli.js tags                      List all tags

Options for update:
  --tags <a,b>        Comma-separated tags
  --keywords <a,b>    Comma-separated keywords  
  --subjects <a,b>     Comma-separated subjects
  --summary <text>    Memory summary

Examples:
  node cli.js list 20
  node cli.js query 股票
  node cli.js update abc123 --tags "A股,交易" --summary "讨论了A股交易策略"
      `);
  }

  db?.close();
}

main();
