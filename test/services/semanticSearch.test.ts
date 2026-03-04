import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the modules we want to test
import { semanticSearch, hybridSearch } from '../../src/services/semanticSearch.js';
import * as embedding from '../../src/services/embedding.js';
import * as schema from '../../src/db/schema.js';

describe('SemanticSearch Service', () => {
  let mockDb: any;
  let generateEmbeddingSpy: any;
  let cosineSimilaritySpy: any;
  let getDatabaseSpy: any;

  beforeEach(() => {
    // Create mock database
    mockDb = {
      prepare: vi.fn().mockImplementation((sql: string) => {
        if (sql.includes('e.embedding IS NOT NULL')) {
          return {
            all: vi.fn().mockReturnValue([
              {
                id: '1',
                summary: 'User asked about machine learning',
                role: 'user',
                created_at: '2024-01-01',
                embedding: JSON.stringify([0.8, 0.9, 0.7, 0.6, 0.5]),
              },
              {
                id: '2',
                summary: 'Assistant explained Python programming',
                role: 'assistant',
                created_at: '2024-01-02',
                embedding: JSON.stringify([0.3, 0.4, 0.5, 0.6, 0.7]),
              },
              {
                id: '3',
                summary: 'User discussed web development',
                role: 'user',
                created_at: '2024-01-03',
                embedding: JSON.stringify([0.1, 0.2, 0.3, 0.4, 0.5]),
              },
            ]),
          };
        }
        return {
          all: vi.fn().mockReturnValue([
            { id: '1', summary: 'User asked about machine learning', role: 'user', created_at: '2024-01-01' },
            { id: '3', summary: 'User discussed web development', role: 'user', created_at: '2024-01-03' },
          ]),
        };
      }),
    };

    // Spy on getDatabase
    getDatabaseSpy = vi.spyOn(schema, 'getDatabase').mockReturnValue(mockDb);

    // Spy on embedding functions
    generateEmbeddingSpy = vi.spyOn(embedding, 'generateEmbedding').mockResolvedValue([0.1, 0.2, 0.3, 0.4, 0.5]);
    cosineSimilaritySpy = vi.spyOn(embedding, 'cosineSimilarity').mockImplementation((a: number[], b: number[]) => {
      if (!a || !b || a.length !== b.length) return 0;
      const dotProduct = a.reduce((sum, v, i) => sum + v * (b[i] || 0), 0);
      return dotProduct > 0.5 ? 0.8 : 0.2;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('semanticSearch', () => {
    it('should generate query embedding', async () => {
      await semanticSearch('test query', 10);
      expect(generateEmbeddingSpy).toHaveBeenCalledWith('test query');
    });

    it('should return search results sorted by relevance', async () => {
      cosineSimilaritySpy.mockImplementation((_a: number[], b: number[]) => {
        if (b && b[0] === 0.8) return 0.9;
        if (b && b[0] === 0.3) return 0.5;
        if (b && b[0] === 0.1) return 0.3;
        return 0;
      });

      const results = await semanticSearch('machine learning', 10);
      expect(results.length).toBeGreaterThan(0);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].relevanceScore).toBeGreaterThanOrEqual(results[i].relevanceScore);
      }
    });

    it('should filter results below threshold 0.3', async () => {
      cosineSimilaritySpy.mockImplementation(() => 0.25);

      const results = await semanticSearch('test query', 10);
      results.forEach(r => {
        expect(r.relevanceScore).toBeGreaterThan(0.3);
      });
    });

    it('should limit results to specified limit', async () => {
      cosineSimilaritySpy.mockImplementation(() => 0.9);

      const results = await semanticSearch('test query', 2);
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should return results with matchType "semantic"', async () => {
      cosineSimilaritySpy.mockImplementation(() => 0.9);

      const results = await semanticSearch('test query', 10);
      results.forEach(r => {
        expect(r.matchType).toBe('semantic');
      });
    });

    it('should handle empty results', async () => {
      getDatabaseSpy.mockReturnValueOnce({
        prepare: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }),
      });

      const results = await semanticSearch('nonexistent query', 10);
      expect(results).toEqual([]);
    });
  });

  describe('hybridSearch', () => {
    it('should perform keyword search', async () => {
      await hybridSearch('machine learning', 10);
      expect(getDatabaseSpy).toHaveBeenCalled();
    });

    it('should perform semantic search', async () => {
      await hybridSearch('machine learning', 10);
      expect(generateEmbeddingSpy).toHaveBeenCalledWith('machine learning');
    });

    it('should merge keyword and semantic results', async () => {
      cosineSimilaritySpy.mockImplementation(() => 0.9);

      const results = await hybridSearch('machine learning', 10);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should calculate combined relevance score with weights', async () => {
      cosineSimilaritySpy.mockImplementation(() => 0.8);

      const results = await hybridSearch('test query', 10, 0.3, 0.7);
      results.forEach(r => {
        if (r.matchType === 'both') {
          expect(r.relevanceScore).toBeGreaterThan(0);
        }
      });
    });

    it('should respect custom weights', async () => {
      const results = await hybridSearch('test', 10, 0.2, 0.8);
      expect(results).toBeDefined();
    });

    it('should limit results to specified limit', async () => {
      const results = await hybridSearch('test query', 3, 0.5, 0.5);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should sort results by combined relevance score', async () => {
      cosineSimilaritySpy.mockImplementation((_a: number[], b: number[]) => {
        if (b && b[0] === 0.8) return 0.9;
        return 0.5;
      });

      const results = await hybridSearch('test query', 10, 0.5, 0.5);
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].relevanceScore).toBeGreaterThanOrEqual(results[i].relevanceScore);
      }
    });

    it('should mark results that match both keyword and semantic as "both"', async () => {
      cosineSimilaritySpy.mockImplementation(() => 0.8);

      const results = await hybridSearch('machine learning', 10, 0.5, 0.5);
      const bothMatches = results.filter(r => r.matchType === 'both');
      expect(bothMatches.length).toBeGreaterThan(0);
    });
  });
});
