import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  normalizeVector,
  getEmbeddingConfig
} from '../../src/services/embedding.js';

describe('Embedding Service', () => {
  let fetchMock: any;

  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateEmbedding', () => {
    it('should generate embedding from text', async () => {
      const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: mockEmbedding }]
        })
      });

      // Set environment variables
      vi.stubEnv('LLM_BASE_URL', 'https://api.openai.com/v1');
      vi.stubEnv('LLM_API_KEY', 'test-api-key');

      const result = await generateEmbedding('test text');

      expect(result).toEqual(mockEmbedding);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.openai.com/v1/embeddings',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            model: 'text-embedding-3-small',
            input: 'test text'
          })
        })
      );
    });

    it('should throw error when API key is not set', async () => {
      vi.stubEnv('LLM_API_KEY', '');
      vi.stubEnv('OPENAI_API_KEY', '');

      await expect(generateEmbedding('test text')).rejects.toThrow(
        'No API key configured'
      );
    });

    it('should use custom model from config', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [{ embedding: [0.1, 0.2] }]
        })
      });

      vi.stubEnv('LLM_API_KEY', 'test-api-key');

      await generateEmbedding('test text', {
        model: 'text-embedding-3-large',
        baseUrl: 'https://custom.api.com/v1'
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://custom.api.com/v1/embeddings',
        expect.objectContaining({
          body: JSON.stringify({
            model: 'text-embedding-3-large',
            input: 'test text'
          })
        })
      );
    });
  });

  describe('generateEmbeddings (batch)', () => {
    it('should generate embeddings for multiple texts', async () => {
      const mockEmbeddings = [
        [0.1, 0.2, 0.3],
        [0.4, 0.5, 0.6]
      ];
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { index: 0, embedding: mockEmbeddings[0] },
            { index: 1, embedding: mockEmbeddings[1] }
          ]
        })
      });

      vi.stubEnv('LLM_API_KEY', 'test-api-key');

      const result = await generateEmbeddings(['text1', 'text2']);

      expect(result).toEqual(mockEmbeddings);
    });
  });

  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vector = [1, 2, 3, 4, 5];
      expect(cosineSimilarity(vector, vector)).toBe(1);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 2, 3];
      const b = [-1, -2, -3];
      const similarity = cosineSimilarity(a, b);
      expect(similarity).toBeCloseTo(-1, 5);
    });

    it('should throw error for vectors with different dimensions', () => {
      const a = [1, 2, 3];
      const b = [1, 2];

      expect(() => cosineSimilarity(a, b)).toThrow(
        'Vectors must have same dimension'
      );
    });

    it('should return 0 for zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];

      expect(cosineSimilarity(a, b)).toBe(0);
      expect(cosineSimilarity(b, a)).toBe(0);
    });

    it('should calculate similarity correctly', () => {
      const a = [1, 2, 3];
      const b = [2, 4, 6];

      // These are in the same direction, similarity should be 1
      expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    });
  });

  describe('normalizeVector', () => {
    it('should normalize a vector to unit length', () => {
      const v = [3, 4];
      const normalized = normalizeVector(v);

      // Magnitude of [3, 4] is 5
      expect(normalized).toEqual([0.6, 0.8]);
    });

    it('should return same vector for unit vector', () => {
      const v = [1, 0, 0];
      const normalized = normalizeVector(v);

      expect(normalized).toEqual([1, 0, 0]);
    });

    it('should return zero vector for zero input', () => {
      const v = [0, 0, 0];
      const normalized = normalizeVector(v);

      expect(normalized).toEqual([0, 0, 0]);
    });

    it('should preserve direction for any vector', () => {
      const v = [1, 2, 3, 4, 5];
      const normalized = normalizeVector(v);

      // Sum of squares should be 1
      const sumOfSquares = normalized.reduce((sum, val) => sum + val * val, 0);
      expect(sumOfSquares).toBeCloseTo(1, 10);
    });
  });

  describe('getEmbeddingConfig', () => {
    it('should use environment variables when no config provided', () => {
      vi.stubEnv('LLM_BASE_URL', 'https://custom.api.com');
      vi.stubEnv('LLM_API_KEY', 'env-api-key');
      vi.stubEnv('LLM_FORMAT', 'openai-compatible');
      vi.stubEnv('EMBEDDING_MODEL', 'custom-embedding-model');

      const config = getEmbeddingConfig();

      expect(config.baseUrl).toBe('https://custom.api.com');
      expect(config.apiKey).toBe('env-api-key');
      expect(config.format).toBe('openai-compatible');
      expect(config.model).toBe('custom-embedding-model');
    });

    it('should override environment variables with config', () => {
      vi.stubEnv('LLM_BASE_URL', 'https://env.api.com');
      vi.stubEnv('LLM_API_KEY', 'env-key');

      const config = getEmbeddingConfig({
        baseUrl: 'https://override.api.com',
        apiKey: 'override-key'
      });

      expect(config.baseUrl).toBe('https://override.api.com');
      expect(config.apiKey).toBe('override-key');
    });
  });
});
