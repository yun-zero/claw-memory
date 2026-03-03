/**
 * Scheduler Service
 * Manages scheduled tasks for deduplication and summary generation
 */

import Database from 'better-sqlite3';
import cron, { ScheduledTask } from 'node-cron';
import { generateSummaryWithLLM } from '../config/llm.js';

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
    this.db = db;
    this.config = { ...DEFAULT_CONFIG, ...config };
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
        await this.dailySummary();
        break;
      case 'weekly':
        this.weeklySummary();
        break;
      case 'monthly':
        this.monthlySummary();
        break;
    }

    // Continue processing if more tasks in queue
    if (this.taskQueue.length > 0) {
      setTimeout(() => this.processQueue(), 1000);
    }
  }

  /**
   * Executes deduplication task - finds and marks duplicate memories
   */
  private async deduplicate(): Promise<void> {
    console.log('[Scheduler] Running deduplication...');

    // Get all non-archived memories that are not already marked as duplicates
    const memories = this.db.prepare(`
      SELECT id, content_path, importance
      FROM memories
      WHERE is_archived = FALSE AND is_duplicate = FALSE
      ORDER BY created_at DESC
    `).all() as any[];

    const processed = new Set<string>();

    for (const memory of memories) {
      if (processed.has(memory.id)) continue;

      // Find similar memories (via shared entities)
      const similar = this.db.prepare(`
        SELECT m2.id, m2.content_path, m2.importance
        FROM memories m1
        JOIN memory_entities me1 ON m1.id = me1.memory_id
        JOIN memory_entities me2 ON me1.entity_id = me2.entity_id
        JOIN memories m2 ON me2.memory_id = m2.id
        WHERE m1.id = ? AND m2.id != m1.id
          AND m2.is_archived = FALSE AND m2.is_duplicate = FALSE
      `).all(memory.id) as any[];

      for (const similarMem of similar) {
        if (processed.has(similarMem.id)) continue;

        // Mark as duplicate
        this.db.prepare(`
          UPDATE memories
          SET is_duplicate = TRUE, duplicate_of = ?
          WHERE id = ?
        `).run(memory.id, similarMem.id);

        // Merge importance
        const newImportance = Math.min(1, memory.importance + similarMem.importance * 0.5);
        this.db.prepare(`
          UPDATE memories SET importance = ? WHERE id = ?
        `).run(newImportance, memory.id);

        processed.add(similarMem.id);
        console.log(`[Scheduler] Marked ${similarMem.id} as duplicate of ${memory.id}`);
      }

      processed.add(memory.id);
    }

    console.log('[Scheduler] Deduplication completed');
  }

  /**
   * Executes daily summary task - generates summary for previous day's memories
   */
  private async dailySummary(): Promise<void> {
    console.log('[Scheduler] Running daily summary...');

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const dateStr = yesterday.toISOString().split('T')[0];

    // 检查是否已有总结
    const existing = this.db.prepare(`
      SELECT summary FROM time_buckets WHERE date = ?
    `).get(dateStr) as { summary?: string } | undefined;

    if (existing?.summary) {
      console.log(`[Scheduler] Daily summary for ${dateStr} already exists`);
      return;
    }

    // 获取当天的记忆
    const memories = this.db.prepare(`
      SELECT id, content_path FROM memories
      WHERE date(created_at) = date(?)
    `).all(dateStr) as any[];

    if (memories.length === 0) {
      console.log(`[Scheduler] No memories for ${dateStr}, skipping`);
      return;
    }

    // 读取记忆内容
    const fs = await import('fs/promises');
    const contents: string[] = [];

    for (const mem of memories) {
      try {
        const content = await fs.readFile(mem.content_path, 'utf-8');
        contents.push(content.slice(0, 1000));
      } catch (e) {
        console.error(`[Scheduler] Failed to read ${mem.content_path}`);
      }
    }

    // 构建报告字符串并调用 LLM 生成总结
    const reportString = `日期: ${dateStr}\n记忆数量: ${memories.length}\n\n记忆内容:\n${contents.join('\n---\n')}`;

    try {
      const summary = await generateSummaryWithLLM(reportString);

      // 保存到 time_buckets
      this.db.prepare(`
        INSERT OR REPLACE INTO time_buckets (date, summary, summary_generated_at, memory_count)
        VALUES (?, ?, datetime('now'), ?)
      `).run(dateStr, summary, memories.length);

      console.log(`[Scheduler] Daily summary generated for ${dateStr}`);
    } catch (error) {
      console.error('[Scheduler] Failed to generate daily summary:', error);
    }
  }

  /**
   * Executes weekly summary task (placeholder - logs for now)
   */
  private weeklySummary(): void {
    console.log('[Scheduler] Running weekly summary task...');
    // TODO: Implement weekly summary logic
    // - Query memories from the past week
    // - Generate comprehensive report
    // - Use SummarizerService
  }

  /**
   * Executes monthly summary task (placeholder - logs for now)
   */
  private monthlySummary(): void {
    console.log('[Scheduler] Running monthly summary task...');
    // TODO: Implement monthly summary logic
    // - Query memories from the past month
    // - Generate monthly report
    // - Update integrated summary
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
