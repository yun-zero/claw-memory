#!/usr/bin/env node

import { Command } from 'commander';
import { getDatabase } from './db/schema.js';
import { TagService } from './services/tagService.js';
import { writeFile } from 'fs/promises';

const program = new Command();

program
  .name('claw-memory')
  .description('OpenClaw 记忆插件 - CLI 工具')
  .version('0.1.0');

program
  .command('init')
  .description('Initialize database')
  .option('-d, --data-dir <dir>', 'Data directory', './memories')
  .action((options) => {
    const db = getDatabase(`${options.dataDir}/memory.db`);
    console.log('Database initialized');
  });

program
  .command('tags <action>')
  .description('标签管理命令')
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
