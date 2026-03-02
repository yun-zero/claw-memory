import { describe, it, expect } from 'vitest';
import { createSaveMemoryTool, createSearchMemoryTool, createGetContextTool } from '../../src/mcp/tools.js';

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
  });
});
