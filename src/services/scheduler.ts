/**
 * Scheduler Service
 * Manages scheduled tasks for deduplication and summary generation
 */

import Database from 'better-sqlite3';
import cron, { ScheduledTask } from 'node-cron';

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
    this.processQueue();
  }

  /**
   * Processes the task queue
   */
  private processQueue(): void {
    if (this.taskQueue.length === 0) {
      return;
    }

    const task = this.taskQueue.shift();
    if (!task) return;

    console.log(`[Scheduler] Processing ${task.type} task...`);

    switch (task.type) {
      case 'deduplicate':
        this.deduplicate();
        break;
      case 'daily':
        this.dailySummary();
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
   * Executes deduplication task (placeholder - logs for now)
   */
  private deduplicate(): void {
    console.log('[Scheduler] Running deduplicate task...');
    // TODO: Implement deduplication logic
    // - Find similar memories based on embeddings
    // - Mark duplicates with is_duplicate flag
    // - Update duplicate_of reference
  }

  /**
   * Executes daily summary task (placeholder - logs for now)
   */
  private dailySummary(): void {
    console.log('[Scheduler] Running daily summary task...');
    // TODO: Implement daily summary logic
    // - Query memories from the past day
    // - Generate summary using LLM
    // - Update time_buckets table
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
