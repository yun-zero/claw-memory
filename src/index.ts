#!/usr/bin/env node

import { Command } from 'commander';
import { getDatabase } from './db/schema.js';
import { TagService } from './services/tagService.js';
import { writeFile } from 'fs/promises';

const program = new Command();

program
  .name('claw-memory')
  .description('OpenClaw 记忆插件 - CLI 工具')
  .version('0.6.7');

program
  .command('init')
  .description('Initialize database')
  .option('-d, --data-dir <dir>', 'Data directory', './memories')
  .action((options) => {
    const db = getDatabase(`${options.dataDir}/memory.db`);
    console.log('Database initialized');
  });

// 命令: list - 按时间查询最近N条记忆
program
  .command('list [limit]')
  .description('列出最近N条记忆 (默认: 10)')
  .option('-d, --data-dir <dir>', 'Data directory', '~/.openclaw/claw-memory')
  .action(async (limit, options) => {
    const dataDir = options.dataDir.replace('~', process.env.HOME || '/home/ubuntu');
    const dbPath = `${dataDir}/memory.db`;
    const db = getDatabase(dbPath);
    const limitNum = parseInt(limit) || 10;

    const memories = db.prepare(`
      SELECT m.id, m.summary, m.role, m.created_at,
             GROUP_CONCAT(DISTINCT e.name) as entities
      FROM memories m
      LEFT JOIN memory_entities me ON m.id = me.memory_id
      LEFT JOIN entities e ON me.entity_id = e.id
      GROUP BY m.id
      ORDER BY m.created_at DESC
      LIMIT ?
    `).all(limitNum) as any[];

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
  });

// 命令: query - 通过标签或实体查询
program
  .command('query <keyword>')
  .description('通过标签或实体查询记忆')
  .option('-d, --data-dir <dir>', 'Data directory', '~/.openclaw/claw-memory')
  .action(async (keyword, options) => {
    const dataDir = options.dataDir.replace('~', process.env.HOME || '/home/ubuntu');
    const dbPath = `${dataDir}/memory.db`;
    const db = getDatabase(dbPath);

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
    `).all(`%${keyword}%`) as any[];

    if (results.length === 0) {
      console.log(`No memories found matching "${keyword}".`);
      return;
    }

    console.log(`\n=== Found ${results.length} memories for "${keyword}" ===\n`);
    results.forEach((m, i) => {
      const date = new Date(m.created_at).toLocaleString();
      const summary = m.summary ? m.summary.substring(0, 150) + (m.summary.length > 150 ? '...' : '') : '(无摘要)';
      
      console.log(`[${i + 1}] ${date} (${m.role})`);
      console.log(`    Entities: ${m.entities || '(无)'}`);
      console.log(`    Summary: ${summary}`);
      console.log(`    ID: ${m.id}`);
      console.log('');
    });
  });

// 命令: update - 更新记忆的标签/实体/摘要
program
  .command('update <memory-id>')
  .description('更新记忆的标签/实体/摘要')
  .option('-d, --data-dir <dir>', 'Data directory', '~/.openclaw/claw-memory')
  .option('-t, --tags <tags>', '逗号分隔的标签')
  .option('-k, --keywords <keywords>', '逗号分隔的关键词')
  .option('-s, --subjects <subjects>', '逗号分隔的主题')
  .option('-m, --summary <summary>', '记忆摘要')
  .action(async (memoryId, options) => {
    const dataDir = options.dataDir.replace('~', process.env.HOME || '/home/ubuntu');
    const dbPath = `${dataDir}/memory.db`;
    const db = getDatabase(dbPath);

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
      ...(options.tags ? options.tags.split(',') : []).map((name: string, i: number) => ({ name: name.trim(), type: 'tag', relevance: 1.0 - i * 0.1 })),
      ...(options.keywords ? options.keywords.split(',') : []).map((name: string, i: number) => ({ name: name.trim(), type: 'keyword', relevance: 0.8 - i * 0.1 })),
      ...(options.subjects ? options.subjects.split(',') : []).map((name: string, i: number) => ({ name: name.trim(), type: 'subject', relevance: 0.9 - i * 0.1 }))
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
  });

// 命令: tags - 列出所有标签
program
  .command('tags')
  .description('列出所有标签')
  .option('-d, --data-dir <dir>', 'Data directory', '~/.openclaw/claw-memory')
  .action(async (options) => {
    const dataDir = options.dataDir.replace('~', process.env.HOME || '/home/ubuntu');
    const dbPath = `${dataDir}/memory.db`;
    const db = getDatabase(dbPath);

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
  });

program
  .command('tag-cmd <action>')
  .description('标签管理命令 (兼容旧版本)')
  .option('-o, --output <file>', '输出文件路径')
  .option('-d, --data-dir <dir>', 'Data directory', './memories')
  .action(async (action, options) => {
    const db = getDatabase(`${options.dataDir}/memory.db`);
    const tagService = new TagService(db);
    const outputFile = options.output || (action === 'tree' ? 'tags-tree.html' : 'tags-stats.html');

    if (action === 'tree') {
      const data = await tagService.getTagTree();
      const html = tagService.generateTreeHtml(data);
      await writeFile(outputFile, html);
      console.log(`标签树已生成: ${outputFile}`);
    } else if (action === 'stats') {
      const stats = await tagService.getTagStats();
      const html = tagService.generateStatsHtml(stats);
      await writeFile(outputFile, html);
      console.log(`标签统计已生成: ${outputFile}`);
    } else {
      console.error('未知命令: tree 或 stats');
      process.exit(1);
    }
  });

program.parse();
