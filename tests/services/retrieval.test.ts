import { describe, it, expect } from 'vitest';
import { calculateWeight, DEFAULT_TIME_DECAY, TimeDecayConfig } from '../../src/services/retrieval.js';

describe('Retrieval Service', () => {
  describe('calculateWeight', () => {
    it('should calculate high weight for today', () => {
      const today = new Date().toISOString().split('T')[0];
      const config: TimeDecayConfig = {
        today: 30,
        week: 20,
        month: 10,
        year: 5,
        older: 0
      };

      const weight = calculateWeight({
        entityMatch: 10,
        timeDecay: config,
        memoryDate: today,
        tagMatch: 10,
        importance: 0.8
      });

      expect(weight).toBeGreaterThan(0);
    });

    it('should calculate lower weight for older memories', () => {
      const oldDate = '2020-01-01';
      const config: TimeDecayConfig = {
        today: 30,
        week: 20,
        month: 10,
        year: 5,
        older: 0
      };

      const weight = calculateWeight({
        entityMatch: 10,
        timeDecay: config,
        memoryDate: oldDate,
        tagMatch: 10,
        importance: 0.8
      });

      expect(weight).toBeLessThan(30);
    });
  });

  describe('calculateWeight boundaries', () => {
    const baseConfig = DEFAULT_TIME_DECAY;

    it('should return max weight for today', () => {
      const today = new Date().toISOString().split('T')[0];
      const weight = calculateWeight({
        entityMatch: 4,
        timeDecay: baseConfig,
        memoryDate: today,
        tagMatch: 10,
        importance: 1.0
      });
      // entityWeight=40, timeWeight=30, tagWeight=20, importanceWeight=10
      // total = 40*0.4 + 30*0.3 + 20*0.2 + 10*0.1 = 16 + 9 + 4 + 1 = 30
      expect(weight).toBe(30);
    });

    it('should return lower weight for 1 week ago', () => {
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const weight = calculateWeight({
        entityMatch: 4,
        timeDecay: baseConfig,
        memoryDate: lastWeek,
        tagMatch: 10,
        importance: 1.0
      });
      expect(weight).toBeLessThan(30);
    });

    it('should return lower weight for 1 year ago', () => {
      const lastYear = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const weight = calculateWeight({
        entityMatch: 4,
        timeDecay: baseConfig,
        memoryDate: lastYear,
        tagMatch: 10,
        importance: 1.0
      });
      // timeWeight=5 (year), entityWeight=40, tagWeight=20, importanceWeight=10
      // total = 40*0.4 + 5*0.3 + 20*0.2 + 10*0.1 = 16 + 1.5 + 4 + 1 = 22.5
      expect(weight).toBe(22.5);
    });

    it('should return non-zero weight when importance=0 but other factors present', () => {
      const today = new Date().toISOString().split('T')[0];
      const weight = calculateWeight({
        entityMatch: 0,
        timeDecay: baseConfig,
        memoryDate: today,
        tagMatch: 0,
        importance: 0
      });
      // Only timeWeight=30 contributes when all others are 0
      // total = 0*0.4 + 30*0.3 + 0*0.2 + 0*0.1 = 9
      expect(weight).toBe(9);
    });

    it('should cap entityMatch at 40', () => {
      const today = new Date().toISOString().split('T')[0];
      const weight = calculateWeight({
        entityMatch: 10,
        timeDecay: baseConfig,
        memoryDate: today,
        tagMatch: 0,
        importance: 0
      });
      // entityWeight = min(10*10, 40) = 40 (capped), timeWeight = 30
      // total = 40*0.4 + 30*0.3 = 16 + 9 = 25
      expect(weight).toBe(25);
    });

    it('should cap tagMatch at 20', () => {
      const today = new Date().toISOString().split('T')[0];
      const weight = calculateWeight({
        entityMatch: 0,
        timeDecay: baseConfig,
        memoryDate: today,
        tagMatch: 20,
        importance: 0
      });
      // tagWeight = min(20*2, 20) = 20 (capped), timeWeight = 30
      // total = 30*0.3 + 20*0.2 = 9 + 4 = 13
      expect(weight).toBe(13);
    });

    it('should handle future dates gracefully', () => {
      const future = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const weight = calculateWeight({
        entityMatch: 0,
        timeDecay: baseConfig,
        memoryDate: future,
        tagMatch: 0,
        importance: 0.5
      });
      expect(weight).toBeGreaterThanOrEqual(0);
    });
  });
});
