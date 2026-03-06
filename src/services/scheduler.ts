/**
 * Scheduler Service
 * Manages scheduled tasks for deduplication and summary generation
 */

import Database from 'better-sqlite3';
import cron, { ScheduledTask } from 'node-cron';
import { generateSummaryWithLLM } from '../config/llm.js';
import { Summarizer } from './summarizer.js';
import { LlmDeduplicator, MemoryPair } from './llmDeduplicator.js';
import { formatDate } from '../utils/helpers.js';

/**
 * Scheduler configuration interface
 */
export interface SchedulerConfig {
  /** Time to run deduplication task (HH:mm format, e.g., "01:00") */
  deduplicateTime: string;
  /** Time to run daily summary task (HH:mm format) */
  dailyTime: string;
  /** Time to run weekly summary task (HH:mm format) */
  weeklyTime: string;
  /** Time to run monthly summary task (HH:mm format) */
  monthlyTime: string;
  /** Whether the scheduler is enabled */
  enabled: boolean;
}

/**
 * Default scheduler configuration
 */
export const DEFAULT_CONFIG: SchedulerConfig = {
  deduplicateTime: '01:00',
  dailyTime: '02:00',
  weeklyTime: '03:00',
  monthlyTime: '04:00',
  enabled: true
};

/**
 * Task type enum
 */
type TaskType = 'deduplicate' | 'daily' | 'weekly' | 'monthly';

/**
 * Queued task item
 */
interface QueuedTask {
  type: TaskType;
  scheduledTime: Date;
}

/**
 * Scheduler Service Class
 * Manages scheduled tasks with execution locking and task queue
 */
export class Scheduler {
  private config: SchedulerConfig;
  private isRunning: boolean;
  private taskQueue: QueuedTask[];
  private tasks: Map<TaskType, ScheduledTask>;
  private db: Database.Database;

  /**
   * Creates a new Scheduler instance
   * @param db - Database instance
   * @param config - Optional configuration (uses DEFAULT_CONFIG if not provided)
   */
  constructor(db: Database.Database, config?: Partial<SchedulerConfig>) {
    // DEBUG: Scheduler 构造函数日志
    console.log('[ClawMemory] Scheduler constructor called');
    console.log('[ClawMemory] Scheduler config:', JSON.stringify(config));

    // 合并环境变量配置
    const envConfig: Partial<SchedulerConfig> = {};

    if (process.env.SCHEDULER_DEDUPE_TIME) {
      envConfig.deduplicateTime = process.env.SCHEDULER_DEDUPE_TIME;
    }
    if (process.env.SCHEDULER_DAILY_TIME) {
      envConfig.dailyTime = process.env.SCHEDULER_DAILY_TIME;
    }
    if (process.env.SCHEDULER_WEEKLY_TIME) {
      envConfig.weeklyTime = process.env.SCHEDULER_WEEKLY_TIME;
    }
    if (process.env.SCHEDULER_MONTHLY_TIME) {
      envConfig.monthlyTime = process.env.SCHEDULER_MONTHLY_TIME;
    }
    if (process.env.SCHEDULER_ENABLED !== undefined) {
      envConfig.enabled = process.env.SCHEDULER_ENABLED !== 'false';
    }

    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...envConfig, ...config };
    this.isRunning = false;
    this.taskQueue = [];
    this.tasks = new Map();
  }

  /**
   * Starts the scheduler and all scheduled tasks
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    if (!this.config.enabled) {
      console.log('[Scheduler] Scheduler is disabled');
      return;
    }

    console.log('[Scheduler] Starting scheduler...');

    this.scheduleDeduplicate();
    this.scheduleDailySummary();
    this.scheduleWeeklySummary();
    this.scheduleMonthlySummary();

    this.isRunning = true;
    console.log('[Scheduler] Scheduler started successfully');
  }

  /**
   * Stops the scheduler and all scheduled tasks
   */
  stop(): void {
    if (!this.isRunning) {
      console.log('[Scheduler] Not running');
      return;
    }

    console.log('[Scheduler] Stopping scheduler...');

    for (const [type, task] of this.tasks) {
      task.stop();
      console.log(`[Scheduler] Stopped ${type} task`);
    }

    this.tasks.clear();
    this.taskQueue = [];
    this.isRunning = false;

    console.log('[Scheduler] Scheduler stopped');
  }

  /**
   * Checks if the scheduler is enabled
   * @returns true if enabled, false otherwise
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Checks if the scheduler is currently running
   * @returns true if running, false otherwise
   */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Converts HH:mm time format to cron expression
   * @param time - Time in HH:mm format
   * @returns Cron expression
   */
  private timeToCron(time: string): string {
    const [hour, minute] = time.split(':');
    return `${minute} ${hour} * * *`;
  }

  /**
   * Schedules the deduplicate task
   */
  private scheduleDeduplicate(): void {
    const cronExpression = this.timeToCron(this.config.deduplicateTime);
    const task = cron.schedule(cronExpression, () => {
      this.executeWithLock('deduplicate');
    });
    this.tasks.set('deduplicate', task);
    console.log(`[Scheduler] Scheduled deduplicate task at ${this.config.deduplicateTime}`);
  }

  /**
   * Schedules the daily summary task
   */
  private scheduleDailySummary(): void {
    const cronExpression = this.timeToCron(this.config.dailyTime);
    const task = cron.schedule(cronExpression, () => {
      this.executeWithLock('daily');
    });
    this.tasks.set('daily', task);
    console.log(`[Scheduler] Scheduled daily summary task at ${this.config.dailyTime}`);
  }

  /**
   * Schedules the weekly summary task
   */
  private scheduleWeeklySummary(): void {
    const cronExpression = this.timeToCron(this.config.weeklyTime);
    const task = cron.schedule(cronExpression, () => {
      this.executeWithLock('weekly');
    });
    this.tasks.set('weekly', task);
    console.log(`[Scheduler] Scheduled weekly summary task at ${this.config.weeklyTime}`);
  }

  /**
   * Schedules the monthly summary task
   */
  private scheduleMonthlySummary(): void {
    const cronExpression = this.timeToCron(this.config.monthlyTime);
    const task = cron.schedule(cronExpression, () => {
      this.executeWithLock('monthly');
    });
    this.tasks.set('monthly', task);
    console.log(`[Scheduler] Scheduled monthly summary task at ${this.config.monthlyTime}`);
  }

  /**
   * Executes a task with locking mechanism and queue support
   * @param type - Task type
   */
  private executeWithLock(type: TaskType): void {
    // Add to queue
    const queuedTask: QueuedTask = {
      type,
      scheduledTime: new Date()
    };
    this.taskQueue.push(queuedTask);
    console.log(`[Scheduler] Queued ${type} task (queue size: ${this.taskQueue.length})`);

    // Process queue
    // Note: Not awaiting async processQueue to avoid blocking the cron scheduler
    this.processQueue().catch(err => {
      console.error(`[Scheduler] Error processing queue:`, err);
    });
  }

  /**
   * Processes the task queue
   */
  private async processQueue(): Promise<void> {
    if (this.taskQueue.length === 0) {
      return;
    }

    const task = this.taskQueue.shift();
    if (!task) return;

    console.log(`[Scheduler] Processing ${task.type} task...`);

    switch (task.type) {
      case 'deduplicate':
        await this.deduplicate();
        break;
      case 'daily':
        await this.runDailySummaryTask();
        break;
      case 'weekly':
        await this.weeklySummary();
        break;
      case 'monthly':
        await this.monthlySummary();
        break;
    }

    // Continue processing if more tasks in queue
    if (this.taskQueue.length > 0) {
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  /**
   * Finds candidate pairs for deduplication using rule-based pre-filtering
   * @returns Array of memory pairs that are potential duplicates
   */
  private findDuplicateCandidates(): [MemoryPair, MemoryPair][] {
    const candidates: [MemoryPair, MemoryPair][] = [];
    const processed = new Set<string>();

    const memories = this.db.prepare(`
      SELECT id, summary, role, created_at
      FROM memories
      WHERE is_archived = FALSE AND is_duplicate = FALSE
      ORDER BY created_at DESC
    `).all() as any[];

    for (let i = 0; i < memories.length; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        const mem1 = memories[i];
        const mem2 = memories[j];
        const key = `${mem1.id}:${mem2.id}`;

        if (processed.has(key)) continue;

        // Rule 1: Shared entities count >= 2
        const sharedEntities = this.db.prepare(`
          SELECT COUNT(DISTINCT me1.entity_id) as count
          FROM memory_entities me1
          JOIN memory_entities me2 ON me1.entity_id = me2.entity_id
          WHERE me1.memory_id = ? AND me2.memory_id = ?
        `).get(mem1.id, mem2.id) as { count: number };

        if (sharedEntities.count >= 2) {
          candidates.push([
            { ...mem1, createdAt: new Date(mem1.created_at) },
            { ...mem2, createdAt: new Date(mem2.created_at) }
          ]);
          processed.add(key);
          continue;
        }

        // Rule 2: Same day + Same role + Summary keyword overlap
        const sameDay = mem1.created_at.split('T')[0] === mem2.created_at.split('T')[0];
        const sameRole = mem1.role === mem2.role;

        if (sameDay && sameRole) {
          const words1 = new Set<string>(mem1.summary?.split(/\s+/) || []);
          const words2 = new Set<string>(mem2.summary?.split(/\s+/) || []);
          const intersection = [...words1].filter((w: string) => words2.has(w) && w.length > 2);

          if (intersection.length >= 3) {
            candidates.push([
              { ...mem1, createdAt: new Date(mem1.created_at) },
              { ...mem2, createdAt: new Date(mem2.created_at) }
            ]);
            processed.add(key);
          }
        }
      }
    }

    return candidates;
  }

  /**
   * Executes LLM-based deduplication task
   */
  private async deduplicate(): Promise<void> {
    console.log('[Scheduler] Running LLM-based deduplication...');

    // Step 1: Rule-based pre-filtering to find candidates
    const candidates = this.findDuplicateCandidates();

    if (candidates.length === 0) {
      console.log('[Scheduler] No duplicate candidates found');
      return;
    }

    console.log(`[Scheduler] Found ${candidates.length} candidate pairs`);

    // Step 2: LLM semantic confirmation
    const deduplicator = new LlmDeduplicator();
    const results = await deduplicator.batchCheck(candidates);

    // Step 3: Update database with results
    let duplicateCount = 0;
    for (const [key, result] of results) {
      if (result.isDuplicate && result.confidence > 0.8) {
        const [mem1Id, mem2Id] = key.split(':');

        this.db.prepare(`
          UPDATE memories
          SET is_duplicate = TRUE, duplicate_of = ?
          WHERE id = ?
        `).run(mem1Id, mem2Id);

        this.db.prepare(`
          UPDATE memories SET importance = MIN(1, importance + 0.1)
          WHERE id = ?
        `).run(mem1Id);

        duplicateCount++;
        console.log(`[Scheduler] Marked ${mem2Id} as duplicate of ${mem1Id}: ${result.reason}`);
      }
    }

    console.log(`[Scheduler] Deduplication completed: ${duplicateCount} duplicates marked`);
  }

  /**
   * 获取最后一次日总结的日期
   * @returns 最后总结日期字符串 (YYYY-MM-DD)，如果没有则返回 null
   */
  private getLastSummaryDate(): string | null {
    const result = this.db.prepare(`
      SELECT date FROM time_buckets
      WHERE summary IS NOT NULL
      ORDER BY date DESC
      LIMIT 1
    `).get() as { date: string } | undefined;

    return result?.date || null;
  }

  /**
   * 获取两个日期之间的所有日期（包含起始，不包含结束）
   * @param startDate - 起始日期 (YYYY-MM-DD)
   * @param endDate - 结束日期 (YYYY-MM-DD)，不包含
   * @returns 日期数组
   */
  private getDatesBetween(startDate: string, endDate: string): string[] {
    const dates: string[] = [];
    const current = new Date(startDate);
    const end = new Date(endDate);

    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  /**
   * Formats memory summaries for LLM input
   * @param memories - Array of memories with summary, role, and created_at fields
   * @returns Formatted string for LLM
   */
  private formatSummariesForLLM(memories: { summary: string; role: string; created_at: string }[]): string {
    return memories.map(m => {
      const time = new Date(m.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      return `[${time}] [${m.role}] ${m.summary || '(无摘要)'}`;
    }).join('\n');
  }

  /**
   * 为指定日期生成日总结
   * @param targetDate - 目标日期 (YYYY-MM-DD)
   */
  private async dailySummary(targetDate: string): Promise<void> {
    // 获取当天的记忆
    const memories = this.db.prepare(`
      SELECT id, summary, role, created_at
      FROM memories
      WHERE date(created_at) = date(?)
      ORDER BY created_at
    `).all(targetDate) as any[];

    if (memories.length === 0) {
      console.log(`[Scheduler] No memories for ${targetDate}, skipping`);
      return;
    }

    // 检查已有总结
    const existing = this.db.prepare(`
      SELECT summary, memory_count FROM time_buckets WHERE date = ?
    `).get(targetDate) as { summary?: string; memory_count?: number } | undefined;

    // 如果已有总结且记忆数量一致，跳过
    if (existing?.summary && existing.memory_count === memories.length) {
      console.log(`[Scheduler] Daily summary for ${targetDate} already up-to-date (${memories.length} memories)`);
      return;
    }

    // 有新记忆需要更新，或首次生成
    if (existing?.summary) {
      console.log(`[Scheduler] Updating daily summary for ${targetDate} (${existing.memory_count} -> ${memories.length} memories)`);
    } else {
      console.log(`[Scheduler] Generating daily summary for ${targetDate} (${memories.length} memories)`);
    }

    // 格式化内容
    const content = this.formatSummariesForLLM(memories);

    // 构建报告并调用 LLM
    const reportString = `日期: ${targetDate}\n记忆数量: ${memories.length}\n\n对话记录:\n${content}`;

    try {
      const summary = await generateSummaryWithLLM(reportString);

      // 保存到 time_buckets
      this.db.prepare(`
        INSERT OR REPLACE INTO time_buckets (date, summary, summary_generated_at, memory_count)
        VALUES (?, ?, datetime('now'), ?)
      `).run(targetDate, summary, memories.length);

      console.log(`[Scheduler] Daily summary saved for ${targetDate}`);
    } catch (error) {
      console.error(`[Scheduler] Failed to generate daily summary for ${targetDate}:`, error);
    }
  }

  /**
   * 执行日总结任务 - 每次运行都检查并补充缺失的总结
   *
   * 逻辑：
   * 1. 获取最后一次总结的日期
   * 2. 从该日期 +1 天到昨天，检查每一天
   * 3. 如果有记忆但没有总结，生成总结
   */
  private async runDailySummaryTask(): Promise<void> {
    console.log('[Scheduler] Running daily summary task...');

    // 获取昨天日期
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    // 获取最后一次总结的日期
    const lastSummaryDate = this.getLastSummaryDate();

    // 确定起始日期：最后一次总结 +1 天，或者最早记忆的日期
    let startDate: string;
    if (lastSummaryDate) {
      const nextDay = new Date(lastSummaryDate);
      nextDay.setDate(nextDay.getDate() + 1);
      startDate = nextDay.toISOString().split('T')[0];
    } else {
      // 没有任何总结，从最早有记忆的日期开始
      const earliest = this.db.prepare(`
        SELECT date(created_at) as date FROM memories
        ORDER BY created_at ASC LIMIT 1
      `).get() as { date: string } | undefined;
      startDate = earliest?.date || yesterdayStr;
    }

    // 获取需要检查的日期列表
    const datesToCheck = this.getDatesBetween(startDate, yesterdayStr);

    if (datesToCheck.length === 0) {
      console.log('[Scheduler] No dates need summary');
      return;
    }

    console.log(`[Scheduler] Checking ${datesToCheck.length} dates for missing summaries (${startDate} to ${yesterdayStr})`);

    // 依次处理每个日期
    for (const date of datesToCheck) {
      // 检查该日期是否有记忆
      const memoryCount = this.db.prepare(`
        SELECT COUNT(*) as count FROM memories WHERE date(created_at) = date(?)
      `).get(date) as { count: number };

      if (memoryCount.count === 0) {
        continue; // 没有记忆，跳过
      }

      // 检查是否已有总结
      const existing = this.db.prepare(`
        SELECT summary FROM time_buckets WHERE date = ?
      `).get(date) as { summary?: string } | undefined;

      if (existing?.summary) {
        // 已有总结，检查是否需要增量更新
        const summaryInfo = this.db.prepare(`
          SELECT memory_count FROM time_buckets WHERE date = ?
        `).get(date) as { memory_count: number } | undefined;

        if (summaryInfo && summaryInfo.memory_count === memoryCount.count) {
          continue; // 总结已是最新的
        }
      }

      // 需要生成或更新总结
      await this.dailySummary(date);
    }

    console.log('[Scheduler] Daily summary task completed');
  }

  /**
   * Executes weekly summary task
   */
  private async weeklySummary(): Promise<void> {
    console.log('[Scheduler] Running weekly summary...');

    const now = new Date();
    const dayOfWeek = now.getDay();
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const weekStart = new Date(now.getFullYear(), now.getMonth(), diff);
    weekStart.setHours(0, 0, 0, 0);
    const weekStartStr = weekStart.toISOString().split('T')[0];

    // Check if summary already exists
    const existing = this.db.prepare(`
      SELECT summary FROM time_buckets WHERE date = ?
    `).get(weekStartStr) as { summary?: string } | undefined;

    if (existing?.summary) {
      console.log(`[Scheduler] Weekly summary for ${weekStartStr} already exists`);
      return;
    }

    // Get all memories for this week (直接使用 summary 字段)
    const memories = this.db.prepare(`
      SELECT id, summary, role, created_at
      FROM memories
      WHERE date(created_at) >= date(?) AND date(created_at) <= date('now')
      ORDER BY created_at
    `).all(weekStartStr) as any[];

    if (memories.length === 0) {
      console.log(`[Scheduler] No memories for week ${weekStartStr}, skipping`);
      return;
    }

    // 格式化内容
    const content = this.formatSummariesForLLM(memories.slice(0, 50));

    const summarizer = new Summarizer(this.db);
    const report = {
      period: 'week',
      startDate: weekStartStr,
      endDate: now.toISOString().split('T')[0],
      memoryCount: memories.length,
      memories: content.split('\n')
    };

    try {
      const summary = await summarizer.generateWeeklySummary(report);
      this.db.prepare(`
        INSERT OR REPLACE INTO time_buckets (date, summary, summary_generated_at, memory_count)
        VALUES (?, ?, datetime('now'), ?)
      `).run(weekStartStr, summary, memories.length);
      console.log(`[Scheduler] Weekly summary generated for ${weekStartStr}`);
    } catch (error) {
      console.error('[Scheduler] Failed to generate weekly summary:', error);
    }
  }

  /**
   * Executes monthly summary task
   */
  private async monthlySummary(): Promise<void> {
    console.log('[Scheduler] Running monthly summary...');

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthStartStr = monthStart.toISOString().split('T')[0];

    const existing = this.db.prepare(`
      SELECT summary FROM time_buckets WHERE date = ?
    `).get(monthStartStr) as { summary?: string } | undefined;

    if (existing?.summary) {
      console.log(`[Scheduler] Monthly summary for ${monthStartStr} already exists`);
      return;
    }

    // 获取当月的记忆 (直接使用 summary 字段)
    const memories = this.db.prepare(`
      SELECT id, summary, role, created_at
      FROM memories
      WHERE date(created_at) >= date(?) AND date(created_at) <= date('now')
      ORDER BY created_at
    `).all(monthStartStr) as any[];

    if (memories.length === 0) {
      console.log(`[Scheduler] No memories for month ${monthStartStr}, skipping`);
      return;
    }

    // 格式化内容
    const content = this.formatSummariesForLLM(memories.slice(0, 100));

    const summarizer = new Summarizer(this.db);
    const report = {
      period: 'month',
      startDate: monthStartStr,
      endDate: now.toISOString().split('T')[0],
      memoryCount: memories.length,
      memories: content.split('\n')
    };

    try {
      const summary = await summarizer.generateMonthlySummary(report);
      this.db.prepare(`
        INSERT OR REPLACE INTO time_buckets (date, summary, summary_generated_at, memory_count)
        VALUES (?, ?, datetime('now'), ?)
      `).run(monthStartStr, summary, memories.length);
      console.log(`[Scheduler] Monthly summary generated for ${monthStartStr}`);
    } catch (error) {
      console.error('[Scheduler] Failed to generate monthly summary:', error);
    }
  }

  /**
   * Updates the scheduler configuration
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<SchedulerConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[Scheduler] Configuration updated');
  }

  /**
   * Gets the current configuration
   * @returns Current scheduler configuration
   */
  getConfig(): SchedulerConfig {
    return { ...this.config };
  }

  /**
   * Gets the current queue size
   * @returns Number of pending tasks in queue
   */
  getQueueSize(): number {
    return this.taskQueue.length;
  }
}
