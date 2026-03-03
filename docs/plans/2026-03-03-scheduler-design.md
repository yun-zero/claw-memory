# Scheduler 定时任务系统设计

## 概述

为 Claw-Memory 实现定时任务系统，支持每日/每周/每月自动生成总结，并处理重复记忆的去重。

## 需求

1. 定时执行去重任务、每日总结、每周总结、每月总结
2. 防止任务并发执行
3. 任务失败时记录日志并继续执行下一个任务
4. 默认时间 + 环境变量覆盖配置

## 架构设计

### 整体架构

```
MCP Server
└── Scheduler (内置)
    ├── cron-deduplicate (01:00) → deduplicate()
    ├── cron-daily-summary (02:00) → dailySummary()
    ├── cron-weekly-summary (03:00) → weeklySummary()
    ├── cron-monthly-summary (04:00) → monthlySummary()
    └── ExecutionLock (防止并发)
```

### 核心组件

| 组件 | 职责 |
|-----|------|
| `Scheduler` 类 | 管理定时任务的生命周期，注册和启动 cron 任务 |
| `ExecutionLock` | 简单的执行锁，防止任务并发执行 |
| 任务方法 | `deduplicate()`, `dailySummary()`, `weeklySummary()`, `monthlySummary()` |

## 执行流程

1. MCP Server 启动时，Scheduler 初始化并注册所有 cron 任务
2. 到达执行时间时，检查 `ExecutionLock`
3. 如果有任务正在执行，新任务进入等待队列
4. 任务执行完成后释放锁，继续处理队列中的任务
5. 任务失败时记录日志，继续执行下一个任务

## 数据模型

### Time Buckets (已有)

```sql
-- 时间桶表，用于存储每日/每周/每月的总结
CREATE TABLE time_buckets (
  date TEXT PRIMARY KEY,          -- 日期 (YYYY-MM-DD)
  memory_count INTEGER DEFAULT 0, -- 记忆数量
  summary TEXT,                   -- 总结内容
  summary_generated_at TIMESTAMP,-- 总结生成时间
  key_topics JSON,               -- 关键主题
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Memories (已有，去重字段)

```sql
-- 在 memories 表中已有以下字段
is_duplicate BOOLEAN DEFAULT FALSE,  -- 是否重复
duplicate_of TEXT                     -- 重复于哪个记忆
```

## 配置方式

| 任务 | 默认时间 | 环境变量 | 说明 |
|-----|---------|---------|------|
| 去重 | 01:00 | `SCHEDULER_DEDUPE_TIME` | 格式: HH:mm |
| 每日总结 | 02:00 | `SCHEDULER_DAILY_TIME` | 格式: HH:mm |
| 每周总结 | 03:00 | `SCHEDULER_WEEKLY_TIME` | 格式: HH:mm |
| 每月总结 | 04:00 | `SCHEDULER_MONTHLY_TIME` | 格式: HH:mm |

### CLI 参数

```bash
--enable-scheduler        启用定时任务（默认启用）
--scheduler-disabled      禁用定时任务
```

## 任务实现

### 1. 去重任务 (DeduplicationJob)

- 查询相似记忆（基于关键词和标签）
- 标记重复记忆，设置 `is_duplicate = TRUE` 和 `duplicate_of`
- 更新原记忆的 `importance` 权重

### 2. 每日总结 (DailySummaryJob)

- 获取前一天的 time_bucket
- 如果没有总结，调用 LLM 生成
- 更新 `time_buckets` 表的 summary 字段

### 3. 每周总结 (WeeklySummaryJob)

- 获取本周的所有 daily summaries
- 调用 LLM 生成周总结
- 存储到本周第一天对应的 time_bucket

### 4. 每月总结 (MonthlySummaryJob)

- 获取本月的所有 daily/weekly summaries
- 调用 LLM 生成月总结
- 存储到本月第一天对应的 time_bucket

## 实现细节

### Scheduler 类

```typescript
class Scheduler {
  private isRunning = false;
  private taskQueue: Array<() => Promise<void>> = [];

  start(): void;
  stop(): void;
  private scheduleTask(cronTime: string, task: () => Promise<void>): void;
  private executeWithLock(task: () => Promise<void>): Promise<void>;
}
```

### 执行锁机制

```typescript
private async executeWithLock(task: () => Promise<void>): Promise<void> {
  // 如果有任务正在执行，加入队列等待
  while (this.isRunning) {
    await new Promise(resolve => setTimeout(resolve, 60000)); // 每分钟检查一次
  }

  this.isRunning = true;
  try {
    await task();
  } catch (error) {
    console.error('[Scheduler] Task failed:', error);
  } finally {
    this.isRunning = false;
    // 处理队列中的下一个任务
    this.processQueue();
  }
}
```

## 新增依赖

- `node-cron` - ^2.3.0 或更高版本

## 文件结构

```
src/
├── services/
│   └── scheduler.ts      # Scheduler 服务
├── index.ts              # 集成 Scheduler 到 MCP Server
```

## 测试策略

1. **单元测试** - 测试 Scheduler 的执行锁和队列逻辑
2. **集成测试** - 测试定时任务与现有 service 的集成
3. **手动测试** - 验证 cron 表达式正确执行
