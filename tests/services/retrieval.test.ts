import { describe, it, expect } from 'vitest';
import { calculateWeight, TimeDecayConfig } from '../../src/services/retrieval.js';

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
});
