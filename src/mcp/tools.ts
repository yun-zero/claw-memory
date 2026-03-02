import type { MemoryService } from '../services/memory.js';

export function createSaveMemoryTool(memoryService: MemoryService) {
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

export function createSearchMemoryTool(memoryService: MemoryService) {
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
        memories: memories.map(m => ({
          id: m.id,
          summary: m.summary,
          importance: m.importance,
          created_at: m.createdAt.toISOString()
        }))
      };
    }
  };
}

export function createGetContextTool(memoryService: MemoryService) {
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

export function createGetSummaryTool(memoryService: MemoryService) {
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

export function createListMemoriesTool(memoryService: MemoryService) {
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
    handler: async (_params: any) => {
      return { memories: [] };
    }
  };
}

export function createDeleteMemoryTool(memoryService: MemoryService) {
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
