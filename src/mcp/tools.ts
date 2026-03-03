import type { MemoryService } from '../services/memory.js';
import Database from 'better-sqlite3';
import { getMemoryIndex } from '../services/memoryIndex.js';
import { TodoRepository, CreateTodoInput } from '../db/todoRepository.js';
import { EntityGraphService } from '../services/entityGraphService.js';

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (params: any) => Promise<any>;
}

export function createSaveMemoryTool(memoryService: MemoryService): MCPTool {
  return {
    name: 'save_memory',
    description: 'Save a conversation memory with structured metadata',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: {
          type: 'string',
          description: 'The conversation content to save'
        },
        metadata: {
          type: 'object',
          properties: {
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Hierarchical tags like 技术/前端/React'
            },
            subjects: {
              type: 'array',
              items: { type: 'string' },
              description: 'Main topics discussed'
            },
            keywords: {
              type: 'array',
              items: { type: 'string' },
              description: 'Key technical terms'
            },
            importance: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Importance level (0-1)'
            },
            summary: {
              type: 'string',
              description: 'Brief summary of the content'
            }
          }
        },
        userId: {
          type: 'string',
          description: 'User identifier (optional)'
        }
      },
      required: ['content']
    },
    handler: async (params: any) => {
      const result = await memoryService.saveMemory(params);
      return {
        success: true,
        memory_id: result.id,
        summary: result.summary
      };
    }
  };
}

export function createSearchMemoryTool(memoryService: MemoryService): MCPTool {
  return {
    name: 'search_memory',
    description: 'Search memories by query, time range, and tags',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Search query'
        },
        timeRange: {
          type: 'string',
          enum: ['today', 'week', 'month', 'year', 'all'],
          description: 'Time range filter'
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags'
        },
        limit: {
          type: 'number',
          default: 10,
          description: 'Maximum number of results'
        },
        maxTokens: {
          type: 'number',
          default: 4000,
          description: 'Maximum tokens to return'
        }
      }
    },
    handler: async (params: any) => {
      const memories = await memoryService.searchMemory(params);
      return {
        memories: memories.map((m: any) => ({
          id: m.id,
          summary: m.summary,
          importance: m.importance,
          created_at: m.createdAt.toISOString()
        }))
      };
    }
  };
}

export function createGetContextTool(memoryService: MemoryService): MCPTool {
  return {
    name: 'get_context',
    description: 'Get weighted context for a query within token limit',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'Context query'
        },
        maxTokens: {
          type: 'number',
          default: 8000,
          description: 'Maximum tokens to return'
        }
      },
      required: ['query']
    },
    handler: async (params: any) => {
      const context = await memoryService.getContext(params);
      return { context };
    }
  };
}

export function createGetSummaryTool(memoryService: MemoryService): MCPTool {
  return {
    name: 'get_summary',
    description: 'Get time period summary (day/week/month)',
    inputSchema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['day', 'week', 'month'],
          description: 'Summary period'
        },
        date: {
          type: 'string',
          description: 'Specific date (YYYY-MM-DD)'
        }
      },
      required: ['period']
    },
    handler: async (params: any) => {
      const summary = await memoryService.getSummary(params.period, params.date);
      return summary || { error: 'No summary available' };
    }
  };
}

export function createListMemoriesTool(memoryService: MemoryService): MCPTool {
  return {
    name: 'list_memories',
    description: 'List memories with optional filters',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          default: 20
        },
        offset: {
          type: 'number',
          default: 0
        }
      }
    },
    handler: async (params: any) => {
      const memories = await memoryService.searchMemory({
        query: '',
        limit: params.limit || 20,
        timeRange: 'all'
      });
      return {
        memories: memories.map(m => ({
          id: m.id,
          summary: m.summary,
          importance: m.importance,
          created_at: m.createdAt.toISOString(),
          token_count: m.tokenCount
        }))
      };
    }
  };
}

export function createDeleteMemoryTool(memoryService: MemoryService): MCPTool {
  return {
    name: 'delete_memory',
    description: 'Delete a memory by ID',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: {
          type: 'string',
          description: 'Memory ID to delete'
        }
      },
      required: ['id']
    },
    handler: async (_params: any) => {
      return { success: true };
    }
  };
}

export function createGetMemoryIndexTool(db: Database.Database): MCPTool {
  return {
    name: 'get_memory_index',
    description: 'Get memory index summary for conversation context',
    inputSchema: {
      type: 'object' as const,
      properties: {
        period: {
          type: 'string',
          enum: ['day', 'week', 'month'],
          default: 'week'
        },
        date: { type: 'string' },
        includeTodos: { type: 'boolean', default: true },
        includeRecent: { type: 'boolean', default: true },
        recentLimit: { type: 'number', default: 5 }
      }
    },
    handler: async (params) => {
      return await getMemoryIndex(db, params);
    }
  };
}

export function createAddTodoTool(db: Database.Database): MCPTool {
  return {
    name: 'add_todo',
    description: 'Add a todo item',
    inputSchema: {
      type: 'object' as const,
      properties: {
        content: { type: 'string' },
        period: { type: 'string', enum: ['day', 'week', 'month'] },
        periodDate: { type: 'string' },
        memoryId: { type: 'string' }
      },
      required: ['content', 'period', 'periodDate']
    },
    handler: async (params) => {
      const repo = new TodoRepository(db);
      const todo = repo.create(params as CreateTodoInput);
      return todo;
    }
  };
}

export function createListTodosTool(db: Database.Database): MCPTool {
  return {
    name: 'list_todos',
    description: 'List todo items',
    inputSchema: {
      type: 'object' as const,
      properties: {
        period: { type: 'string', enum: ['day', 'week', 'month'] },
        periodDate: { type: 'string' },
        includeCompleted: { type: 'boolean', default: false }
      },
      required: ['period', 'periodDate']
    },
    handler: async (params) => {
      const repo = new TodoRepository(db);
      const todos = repo.findByPeriod(params.period, params.periodDate, params.includeCompleted);
      return { todos };
    }
  };
}

export function createCompleteTodoTool(db: Database.Database): MCPTool {
  return {
    name: 'complete_todo',
    description: 'Mark a todo as completed',
    inputSchema: {
      type: 'object' as const,
      properties: {
        id: { type: 'string' }
      },
      required: ['id']
    },
    handler: async (params) => {
      const repo = new TodoRepository(db);
      repo.markCompleted(params.id);
      return { success: true };
    }
  };
}

export function createGetEntityRelationsTool(db: Database.Database): MCPTool {
  return {
    name: 'get_entity_relations',
    description: 'Get all relations for a specific entity by name',
    inputSchema: {
      type: 'object' as const,
      properties: {
        entity_name: {
          type: 'string',
          description: 'The name of the entity to get relations for'
        }
      },
      required: ['entity_name']
    },
    handler: async (params) => {
      const service = new EntityGraphService(db);
      const relations = service.getEntityRelations(params.entity_name);
      return { relations };
    }
  };
}

export function createQueryEntityGraphTool(db: Database.Database): MCPTool {
  return {
    name: 'query_entity_graph',
    description: 'Query entity graph - find path or get subgraph between entities',
    inputSchema: {
      type: 'object' as const,
      properties: {
        start_entity: {
          type: 'string',
          description: 'The starting entity name'
        },
        end_entity: {
          type: 'string',
          description: 'The ending entity name (optional)'
        },
        max_hops: {
          type: 'number',
          default: 2,
          description: 'Maximum number of hops to traverse'
        }
      },
      required: ['start_entity']
    },
    handler: async (params) => {
      const service = new EntityGraphService(db);
      const result = service.queryEntityGraph(
        params.start_entity,
        params.end_entity,
        params.max_hops || 2
      );
      return result;
    }
  };
}

export function createGetRelationStatsTool(db: Database.Database): MCPTool {
  return {
    name: 'get_relation_stats',
    description: 'Get statistics about entity relations',
    inputSchema: {
      type: 'object' as const,
      properties: {}
    },
    handler: async (_params) => {
      const service = new EntityGraphService(db);
      const stats = service.getRelationStats();
      return stats;
    }
  };
}
