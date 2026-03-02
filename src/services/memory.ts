import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { readFileSync } from 'fs';
import { writeFile, mkdir } from 'fs/promises';
import { dirname, join } from 'path';
import { MemoryRepository, CreateMemoryInput } from '../db/repository.js';
import { EntityRepository } from '../db/entityRepository.js';
import { calculateWeight, DEFAULT_TIME_DECAY, type SearchOptions } from './retrieval.js';
import { SummarizerService } from './summarizer.js';
import { generateSummaryWithLLM } from '../config/llm.js';
import type { Memory, SaveMemoryInput, GetContextInput, TimeBucket, WeeklyReport } from '../types.js';

export class MemoryService {
  private db: Database.Database;
  private memoryRepo: MemoryRepository;
  private entityRepo: EntityRepository;
  private summarizer: SummarizerService;
  private dataDir: string;

  constructor(db: Database.Database, dataDir: string = './memories') {
    this.db = db;
    this.memoryRepo = new MemoryRepository(db);
    this.entityRepo = new EntityRepository(db);
    this.summarizer = new SummarizerService(db);
    this.dataDir = dataDir;
  }

  async saveMemory(input: SaveMemoryInput): Promise<Memory> {
    const { content, metadata } = input;

    // 生成文件路径
    const date = new Date();
    const datePath = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
    const fileName = `${uuidv4()}.md`;
    const contentPath = join(this.dataDir, datePath, fileName);

    // 保存内容到文件
    await this.saveContentToFile(contentPath, content);

    // 创建记忆记录
    const clampedImportance = this.clampImportance(metadata?.importance);
    const memoryInput: CreateMemoryInput = {
      contentPath,
      summary: metadata?.summary || undefined,
      importance: clampedImportance ?? 0.5,
      tokenCount: this.estimateTokens(content)
    };

    const memory = this.memoryRepo.create(memoryInput);

    // 处理实体关联
    await this.processEntities(memory.id, metadata || {});

    return memory;
  }

  async searchMemory(options: SearchOptions): Promise<Memory[]> {
    const { query, timeRange, tags, limit = 10 } = options;

    // 构建时间过滤条件
    const dateFilter = this.buildDateFilter(timeRange);

    // 获取所有候选记忆
    let memories = this.memoryRepo.findAll(100);

    // 应用查询过滤（如果提供了查询字符串）
    if (query && query.trim() !== '') {
      const searchTerm = query.toLowerCase();
      memories = memories.filter(m => {
        const summaryMatch = m.summary?.toLowerCase().includes(searchTerm);
        // 读取内容文件进行匹配
        let contentMatch = false;
        try {
          const content = this.readContentFromFile(m.contentPath);
          contentMatch = content.toLowerCase().includes(searchTerm);
        } catch {
          // 如果读取失败，忽略内容匹配
        }
        return summaryMatch || contentMatch;
      });
    }

    // 应用时间过滤
    if (dateFilter) {
      memories = memories.filter(m => {
        const created = m.createdAt.toISOString().split('T')[0];
        return created >= dateFilter.start && created <= dateFilter.end;
      });
    }

    // 计算权重并排序
    const weightedMemories = memories.map(memory => ({
      memory,
      weight: calculateWeight({
        entityMatch: 0,
        timeDecay: DEFAULT_TIME_DECAY,
        memoryDate: memory.createdAt.toISOString().split('T')[0],
        tagMatch: 0,
        importance: memory.importance
      })
    }));

    // 按权重排序
    weightedMemories.sort((a, b) => b.weight - a.weight);

    // 返回结果
    return weightedMemories.slice(0, limit).map(w => w.memory);
  }

  async getContext(input: GetContextInput): Promise<string> {
    const { query, maxTokens = 8000 } = input;

    const memories = await this.searchMemory({
      query,
      limit: 20,
      maxTokens
    });

    // 累积内容直到达到 token 限制
    let totalTokens = 0;
    const contextParts: string[] = [];

    for (const memory of memories) {
      const content = this.readContentFromFile(memory.contentPath);
      const tokens = this.estimateTokens(content);

      if (totalTokens + tokens > maxTokens) {
        break;
      }

      contextParts.push(content);
      totalTokens += tokens;

      // 更新访问计数
      this.memoryRepo.updateLastAccessed(memory.id);
    }

    return contextParts.join('\n\n---\n\n');
  }

  async getSummary(period: 'day' | 'week' | 'month', date?: string): Promise<TimeBucket> {
    const targetDate = date ? new Date(date) : new Date();
    const { startDate, endDate } = this.calculatePeriodRange(period, targetDate);

    // 聚合数据
    const report: WeeklyReport = await this.summarizer.aggregateMemories(startDate, endDate);

    // 生成 LLM 总结
    try {
      const reportString = this.summarizer.reportToString(report);
      report.summary = await generateSummaryWithLLM(reportString);
    } catch (error) {
      console.warn('Failed to generate LLM summary:', error);
      report.summary = '总结生成失败，请配置有效的 LLM API Key。';
    }

    // 保存到 time_buckets 表
    this.saveTimeBucket(startDate, report);

    return {
      date: startDate,
      memoryCount: report.basic.totalMemories,
      summary: report.summary,
      summaryGeneratedAt: new Date(),
      keyTopics: report.topics.keyTopics,
      createdAt: new Date()
    };
  }

  private calculatePeriodRange(period: 'day' | 'week' | 'month', date: Date): { startDate: string; endDate: string } {
    const endDate = date.toISOString().split('T')[0];
    const startDate = new Date(date);

    switch (period) {
      case 'day':
        // 返回当天
        break;
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
    }

    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate
    };
  }

  private saveTimeBucket(date: string, report: WeeklyReport): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO time_buckets (date, memory_count, summary, summary_generated_at, key_topics, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      date,
      report.basic.totalMemories,
      report.summary,
      new Date().toISOString(),
      JSON.stringify(report.topics.keyTopics),
      new Date().toISOString()
    );
  }

  private async saveContentToFile(path: string, content: string): Promise<void> {
    const dir = dirname(path);
    await mkdir(dir, { recursive: true });
    await writeFile(path, content, 'utf-8');
  }

  private readContentFromFile(path: string): string {
    try {
      return readFileSync(path, 'utf-8');
    } catch {
      return '';
    }
  }

  private async processEntities(memoryId: string, metadata: SaveMemoryInput['metadata']): Promise<void> {
    // 处理标签
    if (metadata.tags) {
      for (const tag of metadata.tags) {
        const entity = this.entityRepo.findOrCreate({
          name: tag,
          type: 'tag',
          level: tag.split('/').length - 1
        });

        this.db.prepare(`
          INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance)
          VALUES (?, ?, ?)
        `).run(memoryId, entity.id, 1.0);
      }
    }

    // 处理主题
    if (metadata.subjects) {
      for (const subject of metadata.subjects) {
        const entity = this.entityRepo.findOrCreate({
          name: subject,
          type: 'subject'
        });

        this.db.prepare(`
          INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance)
          VALUES (?, ?, ?)
        `).run(memoryId, entity.id, 0.8);
      }
    }

    // 处理关键词
    if (metadata.keywords) {
      for (const keyword of metadata.keywords) {
        const entity = this.entityRepo.findOrCreate({
          name: keyword,
          type: 'keyword'
        });

        this.db.prepare(`
          INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance)
          VALUES (?, ?, ?)
        `).run(memoryId, entity.id, 0.6);
      }
    }
  }

  private buildDateFilter(timeRange?: SearchOptions['timeRange']): { start: string; end: string } | null {
    if (!timeRange || timeRange === 'all') return null;

    const now = new Date();
    const end = now.toISOString().split('T')[0];
    let start: string;

    switch (timeRange) {
      case 'today':
        start = end;
        break;
      case 'week':
        now.setDate(now.getDate() - 7);
        start = now.toISOString().split('T')[0];
        break;
      case 'month':
        now.setMonth(now.getMonth() - 1);
        start = now.toISOString().split('T')[0];
        break;
      case 'year':
        now.setFullYear(now.getFullYear() - 1);
        start = now.toISOString().split('T')[0];
        break;
      default:
        return null;
    }

    return { start, end };
  }

  private clampImportance(value: number | undefined): number | undefined {
    if (value === undefined) {
      return undefined;
    }
    return Math.max(0, Math.min(1, value));
  }

  private estimateTokens(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const otherChars = text.length - chineseChars;
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }
}
