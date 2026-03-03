#!/usr/bin/env node

import { Command } from 'commander';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { getDatabase } from './db/schema.js';
import { MemoryService } from './services/memory.js';
import { Scheduler } from './services/scheduler.js';
import {
  createSaveMemoryTool,
  createSearchMemoryTool,
  createGetContextTool,
  createGetSummaryTool,
  createListMemoriesTool,
  createDeleteMemoryTool
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
  .action(async (options) => {
    const db = getDatabase(`${options.dataDir}/memory.db`);
    const memoryService = new MemoryService(db, options.dataDir);

    const scheduler = new Scheduler(db);
    scheduler.start();

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
          createDeleteMemoryTool(memoryService)
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
        delete_memory: createDeleteMemoryTool(memoryService)
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

program.parse();
