import type { Memory, Entity } from '../types.js';

export interface TimeDecayConfig {
  today: number;
  week: number;
  month: number;
  year: number;
  older: number;
}

export interface WeightInput {
  entityMatch: number;
  timeDecay: TimeDecayConfig;
  memoryDate: string;
  tagMatch: number;
  importance: number;
}

export const DEFAULT_TIME_DECAY: TimeDecayConfig = {
  today: 30,
  week: 20,
  month: 10,
  year: 5,
  older: 0
};

export function calculateWeight(input: WeightInput): number {
  const { entityMatch, timeDecay, memoryDate, tagMatch, importance } = input;

  // 实体匹配权重 (0-40)
  const entityWeight = Math.min(entityMatch * 10, 40);

  // 时间衰减权重 (0-30)
  const timeWeight = getTimeWeight(memoryDate, timeDecay);

  // 标签层级权重 (0-20)
  const tagWeight = Math.min(tagMatch * 2, 20);

  // 重要性权重 (0-10)
  const importanceWeight = importance * 10;

  // 总分 = 实体匹配 × 0.4 + 时间衰减 × 0.3 + 标签层级 × 0.2 + 重要性 × 0.1
  // 归一化到 0-100
  const total =
    entityWeight * 0.4 +
    timeWeight * 0.3 +
    tagWeight * 0.2 +
    importanceWeight * 0.1;

  return Math.round(total * 10) / 10;
}

function getTimeWeight(memoryDate: string, config: TimeDecayConfig): number {
  const today = new Date();
  const memory = new Date(memoryDate);
  const diffDays = Math.floor((today.getTime() - memory.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return config.today;
  if (diffDays <= 7) return config.week;
  if (diffDays <= 30) return config.month;
  if (diffDays <= 365) return config.year;
  return config.older;
}

export interface SearchOptions {
  query: string;
  timeRange?: 'today' | 'week' | 'month' | 'year' | 'all';
  tags?: string[];
  limit?: number;
  maxTokens?: number;
}
