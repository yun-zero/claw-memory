#!/usr/bin/env node

import { Command } from 'commander';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getDatabase } from './db/schema.js';
import { MemoryService } from './services/memory.js';
import { TagService } from './services/tagService.js';
import { Scheduler } from './services/scheduler.js';
import { writeFile } from 'fs/promises';
import {
  createSaveMemoryTool,
  createSearchMemoryTool,
  createGetContextTool,
  createGetSummaryTool,
  createListMemoriesTool,
  createDeleteMemoryTool,
  createGetEntityRelationsTool,
  createQueryEntityGraphTool,
  createGetRelationStatsTool
} from './mcp/tools.js';

const program = new Command();

program
  .name('claw-memory')
  .description('Lightweight AI memory system for OpenClaw and Claude Code')
  .version('0.1.0');

program
  .command('serve')
  .description('Start MCP server')
  .option('-p, --port <port>', 'Server port', '18790')
  .option('-d, --data-dir <dir>', 'Data directory', './memories')
  .option('-s, --scheduler-disabled', 'Disable scheduler', false)
  .action(async (options) => {
    const db = getDatabase(`${options.dataDir}/memory.db`);
    const memoryService = new MemoryService(db, options.dataDir);

    const scheduler = new Scheduler(db, {
      enabled: !options.schedulerDisabled
    });

    if (!options.schedulerDisabled) {
      scheduler.start();
    }

    const server = new Server(
      {
        name: 'claw-memory',
        version: '0.1.0'
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          createSaveMemoryTool(memoryService),
          createSearchMemoryTool(memoryService),
          createGetContextTool(memoryService),
          createGetSummaryTool(memoryService),
          createListMemoriesTool(memoryService),
          createDeleteMemoryTool(memoryService),
          createGetEntityRelationsTool(db),
          createQueryEntityGraphTool(db),
          createGetRelationStatsTool(db)
        ] as any
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      const tools: Record<string, ReturnType<typeof createSaveMemoryTool>> = {
        save_memory: createSaveMemoryTool(memoryService),
        search_memory: createSearchMemoryTool(memoryService),
        get_context: createGetContextTool(memoryService),
        get_summary: createGetSummaryTool(memoryService),
        list_memories: createListMemoriesTool(memoryService),
        delete_memory: createDeleteMemoryTool(memoryService),
        get_entity_relations: createGetEntityRelationsTool(db),
        query_entity_graph: createQueryEntityGraphTool(db),
        get_relation_stats: createGetRelationStatsTool(db)
      };

      const tool = tools[name as keyof typeof tools];
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      return await tool.handler(args);
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Claw-Memory MCP Server started');
  });

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
