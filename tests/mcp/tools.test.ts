import { describe, it, expect } from 'vitest';
import { createSaveMemoryTool, createSearchMemoryTool, createGetContextTool, createListMemoriesTool } from '../../src/mcp/tools.js';

describe('MCP Tools', () => {
  describe('tool definitions', () => {
    it('should create save_memory tool', () => {
      const tool = createSaveMemoryTool({} as any);
      expect(tool.name).toBe('save_memory');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should create search_memory tool', () => {
      const tool = createSearchMemoryTool({} as any);
      expect(tool.name).toBe('search_memory');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should create get_context tool', () => {
      const tool = createGetContextTool({} as any);
      expect(tool.name).toBe('get_context');
      expect(tool.inputSchema).toBeDefined();
    });

    it('should create list_memories tool', () => {
      const tool = createListMemoriesTool({} as any);
      expect(tool.name).toBe('list_memories');
      expect(tool.inputSchema).toBeDefined();
    });
  });

  describe('list_memories handler', () => {
    it('should return memories from memoryService', async () => {
      const mockMemories = [
        {
          id: '1',
          summary: 'Test memory 1',
          importance: 0.8,
          createdAt: new Date('2026-01-01'),
          tokenCount: 100
        },
        {
          id: '2',
          summary: 'Test memory 2',
          importance: 0.5,
          createdAt: new Date('2026-01-02'),
          tokenCount: 150
        }
      ];

      const mockMemoryService = {
        searchMemory: async () => mockMemories
      };

      const tool = createListMemoriesTool(mockMemoryService as any);
      const result = await tool.handler({ limit: 10 });

      expect(result.memories).toHaveLength(2);
      expect(result.memories[0]).toEqual({
        id: '1',
        summary: 'Test memory 1',
        importance: 0.8,
        created_at: '2026-01-01T00:00:00.000Z',
        token_count: 100
      });
      expect(result.memories[1]).toEqual({
        id: '2',
        summary: 'Test memory 2',
        importance: 0.5,
        created_at: '2026-01-02T00:00:00.000Z',
        token_count: 150
      });
    });

    it('should use default limit when not provided', async () => {
      let capturedParams: any = null;
      const mockMemoryService = {
        searchMemory: async (params: any) => {
          capturedParams = params;
          return [];
        }
      };

      const tool = createListMemoriesTool(mockMemoryService as any);
      await tool.handler({});

      expect(capturedParams.limit).toBe(20);
    });

    it('should pass custom limit to searchMemory', async () => {
      let capturedParams: any = null;
      const mockMemoryService = {
        searchMemory: async (params: any) => {
          capturedParams = params;
          return [];
        }
      };

      const tool = createListMemoriesTool(mockMemoryService as any);
      await tool.handler({ limit: 50 });

      expect(capturedParams.limit).toBe(50);
    });
  });
});
