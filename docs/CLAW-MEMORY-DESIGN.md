# Claw-Memory 设计文档

> 创建日期: 2026-03-02
> 状态: 已批准
> 作者: OpenClaw Community

## 1. 项目概述

### 1.1 定位

为 OpenClaw 提供轻量级、持久化的 AI 记忆系统。

### 1.2 核心目标

1. **存储**：保存会话记忆（原始对话 + 结构化知识）
2. **关联**：以图的形式关联记忆的关键词、标签、主体
3. **检索**：按相关性、时间、标签等多维度检索
4. **服务**：通过 OpenClaw 插件系统供调用

### 1.3 设计原则

- **轻量级**：SQLite + 本地文件，无额外服务依赖
- **职责分离**：OpenClaw 负责提取，Memory 负责存储检索
- **增量维护**：每日定时总结、去重、关联（模拟人类睡眠整理）

---

## 2. 系统架构

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        OpenClaw Gateway                           │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           Claw-Memory Plugin                             │   │
│  │                                                          │   │
│  │  Hooks:                                                 │   │
│  │  ├── message:sent  ──▶ 提取 Q&A，保存记忆             │   │
│  │  └── agent:bootstrap ──▶ 注入记忆摘要到上下文         │   │
│  │                                                          │   │
│  │  Tools:                                                 │   │
│  │  ├── memory_save      保存记忆（带 LLM 元数据提取）    │   │
│  │  ├── memory_search    搜索记忆                        │   │
│  │  └── memory_summary   获取记忆摘要                     │   │
│  │                                                          │   │
│  │  Scheduler:                                              │   │
│  │  ├── 01:00 去重任务                                   │   │
│  │  ├── 02:00 每日总结                                   │   │
│  │  ├── 03:00 每周总结                                   │   │
│  │  └── 04:00 每月总结                                   │   │
│  │                                                          │   │
│  │  内置 LLM 调用（复用 OpenClaw 配置）                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                   │
│                              ▼                                   │
│              ┌───────────────────────────────────┐              │
│              │   ~/.openclaw/claw-memory/         │              │
│              │   ├── memory.db (SQLite)          │              │
│              │   └── memories/ (对话文件)        │              │
│              └───────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据分层

```
┌─────────────────────────────────────────┐
│           周期性总结数据                  │
│        (time_buckets 表)                 │
├─────────────────────────────────────────┤
│        LLM 提取的关系性数据              │
│   (memory_entities, entities 表)        │
├─────────────────────────────────────────┤
│          原始对话数据                     │
│      (memories.content_path 文件)       │
└─────────────────────────────────────────┘
```

---

## 3. 数据模型

### 3.1 ER 图

```
┌─────────────┐     ┌───────────────────┐     ┌─────────────┐
│  memories   │     │  memory_entities  │     │  entities   │
├─────────────┤     ├───────────────────┤     ├─────────────┤
│ id (PK)     │────<│ memory_id (FK)    │>────│ id (PK)     │
│ content_path│     │ entity_id (FK)    │     │ name        │
│ summary     │     │ relevance         │     │ type        │
│ created_at  │     │ source            │     │ parent_id   │
│ importance  │     └───────────────────┘     │ level       │
│ token_count │                               │ embedding   │
└─────────────┘                               └──────┬──────┘
                                                     │
      ┌──────────────────────────────────────────────┘
      │
      ▼
┌───────────────────┐
│  entity_relations │
├───────────────────┤
│ source_id (FK)    │
│ target_id (FK)    │
│ relation_type     │
│ weight            │
└───────────────────┘

┌─────────────────┐
│  time_buckets   │
├─────────────────┤
│ date (PK)       │
│ memory_count    │
│ summary         │
│ key_topics      │
└─────────────────┘

┌─────────────────┐
│      todos      │
├─────────────────┤
│ id (PK)         │
│ content         │
│ period          │
│ period_date     │
│ created_at      │
│ completed_at    │
│ memory_id       │
└─────────────────┘
```

### 3.2 表结构

```sql
-- 1. 记忆表
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    content_path TEXT NOT NULL,
    summary TEXT,
    integrated_summary JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    token_count INTEGER DEFAULT 0,
    importance REAL DEFAULT 0.5,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMP,
    is_archived BOOLEAN DEFAULT FALSE,
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_of TEXT
);

-- 2. 统一实体表（支持层级）
CREATE TABLE entities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,  -- keyword/tag/subject/person/project
    parent_id TEXT,
    level INTEGER DEFAULT 0,
    embedding BLOB,
    metadata JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES entities(id)
);

-- 3. 记忆-实体关联表
CREATE TABLE memory_entities (
    memory_id TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    relevance REAL DEFAULT 1.0,
    source TEXT DEFAULT 'auto',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (memory_id, entity_id),
    FOREIGN KEY (memory_id) REFERENCES memories(id),
    FOREIGN KEY (entity_id) REFERENCES entities(id)
);

-- 4. 实体关系图
CREATE TABLE entity_relations (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,  -- related/parent/similar/co_occur
    weight REAL DEFAULT 1.0,
    evidence_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (source_id) REFERENCES entities(id),
    FOREIGN KEY (target_id) REFERENCES entities(id),
    UNIQUE(source_id, target_id, relation_type)
);

-- 5. 时间桶
CREATE TABLE time_buckets (
    date TEXT PRIMARY KEY,
    memory_count INTEGER DEFAULT 0,
    summary TEXT,
    summary_generated_at TIMESTAMP,
    key_topics JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. 待办事项
CREATE TABLE todos (
    id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    period TEXT,           -- 'day' | 'week' | 'month'
    period_date TEXT,     -- 关联的日期
    created_at TEXT,
    completed_at TEXT,
    memory_id TEXT        -- 可选，关联到某个记忆
);

-- 索引
CREATE INDEX idx_memories_created ON memories(created_at);
CREATE INDEX idx_memories_importance ON memories(importance);
CREATE INDEX idx_entities_name ON entities(name);
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_parent ON entities(parent_id);
CREATE INDEX idx_memory_entities_entity ON memory_entities(entity_id);
CREATE INDEX idx_entity_relations_source ON entity_relations(source_id);
CREATE INDEX idx_entity_relations_target ON entity_relations(target_id);
```

---

## 4. 检索算法

### 4.1 权重计算公式

```
总分 = 实体匹配 × 0.4 + 时间衰减 × 0.3 + 标签层级 × 0.2 + 重要性 × 0.1
```

### 4.2 各维度计算

| 维度 | 范围 | 计算规则 |
|-----|------|---------|
| 实体匹配 | 0-40 | 匹配实体数 × 10，上限 40；通过关系图扩展匹配可加分 |
| 时间衰减 | 0-30 | 今天 30，本周 20，本月 10，本年 5，更早 0 |
| 标签层级 | 0-20 | 完全匹配 +10，父级匹配 +7，子级匹配 +5，兄弟节点 +3 |
| 重要性 | 0-10 | 基础重要性 × 5 + 访问频率加成 + 最近访问加成 |

### 4.3 检索流程

1. 提取查询实体
2. 构建时间过滤条件
3. 获取候选记忆
4. 计算综合权重
5. 按权重排序
6. 限制 Token 数量返回

---

## 5. LLM 元数据自动提取

### 5.1 实现方式

- 在 `saveMemory` 时调用 LLM 提取完整 metadata
- 无论是否传入 metadata，都使用 LLM 提取的结果

### 5.2 提取 Prompt

```
你是记忆提取助手。请分析以下对话，提取结构化信息。

## 对话内容
{content}

## 提取要求

请返回 JSON 格式：
{
  "summary": "一句话总结（50字以内）",
  "importance": 0.0-1.0,
  "tags": ["层级标签，如 技术/前端/React"],
  "subjects": ["讨论的主要话题"],
  "keywords": ["关键技术词"],
  "entities": [{"name": "实体名", "type": "person|project|concept|tool|other"}],
  "action_items": ["待办事项"],
  "decisions": ["做出的决定"]
}

## 标签层级参考
- 技术/前端|后端|数据库|运维|AI
- 项目/{项目名}
- 任务/开发|调试|设计|研究|规划
- 通用/日常|想法|计划
```

### 5.3 数据结构

```typescript
interface IntegratedSummary {
  active_areas: string[];  // ["技术/AI (10)", "金融/投资 (3)"]
  key_topics: string[];     // ["React", "OpenClaw", "股票"]
  recent_summary: string;   // "本周主要讨论了AI技术和金融投资..."
}
```

---

## 6. 记忆索引摘要

### 6.1 数据分层（按变化频率排序）

```
1. 时间范围        ─────── 固定（查询时确定）
2. 活跃领域        ─────── 变化较慢（周/月）
3. 待办事项        ─────── 变化中等（随时添加/完成）
4. 最近动态        ─────── 变化频繁（每次对话）
```

### 6.2 摘要输出示例

```
=== 记忆索引 (2026-02-24 ~ 2026-03-02) ===

【活跃领域】
- 技术/前端 (5), 项目/AI (3), 生活/旅行 (2)
- 关键词: React, TypeScript, OpenClaw

【待办事项】
- [ ] 完成 OpenClaw 记忆系统集成
- [ ] 学习 React Server Components

【最近动态】
- 今天: 讨论了 OpenClaw Hooks 机制
- 昨天: 保存了 React 组件设计笔记
- 前天: 查询了 OpenClaw 使用文档
```

---

## 7. 定时任务系统

### 7.1 睡眠周期

```
        记忆写入（白天）
             │
             ▼
    ┌────────────────┐
    │   工作时间      │  ← 不进行整理，只存储
    │  09:00-23:00   │
    └───────┬────────┘
            │
            ▼ 凌晨2点
    ┌────────────────┐
    │  睡眠第一阶段   │  ← 每日总结
    │   整理记忆      │
    │   02:00        │
    └───────┬────────┘
            │
            ▼ 凌晨3点
    ┌────────────────┐
    │  睡眠第二阶段   │  ← 去重清理
    │   消除重复      │
    │   03:00        │
    └───────┬────────┘
            │
            ▼ 凌晨4点
    ┌────────────────┐
    │  睡眠第三阶段   │  ← 关系构建
    │   建立关联      │
    │   04:00        │
    └───────┬────────┘
            │
            ▼ 周一/月初
    ┌────────────────┐
    │   深度整理      │  ← 周/月总结
    └────────────────┘
```

### 7.2 配置方式

| 任务 | 默认时间 | 环境变量 | 说明 |
|-----|---------|---------|------|
| 去重 | 01:00 | `SCHEDULER_DEDUPE_TIME` | 格式: HH:mm |
| 每日总结 | 02:00 | `SCHEDULER_DAILY_TIME` | 格式: HH:mm |
| 每周总结 | 03:00 | `SCHEDULER_WEEKLY_TIME` | 格式: HH:mm |
| 每月总结 | 04:00 | `SCHEDULER_MONTHLY_TIME` | 格式: HH:mm |

### 7.3 任务实现

#### 去重任务 (DeduplicationJob)
- 查询相似记忆（基于关键词和标签）
- 标记重复记忆，设置 `is_duplicate = TRUE` 和 `duplicate_of`
- 更新原记忆的 `importance` 权重

#### 每日总结 (DailySummaryJob)
- 获取前一天的 time_bucket
- 如果没有总结，调用 LLM 生成
- 更新 `time_buckets` 表的 summary 字段

#### 每周总结 (WeeklySummaryJob)
- 获取本周的所有 daily summaries
- 调用 LLM 生成周总结
- 存储到本周第一天对应的 time_bucket

#### 每月总结 (MonthlySummaryJob)
- 获取本月的所有 daily/weekly summaries
- 调用 LLM 生成月总结
- 存储到本月第一天对应的 time_bucket

### 7.4 执行锁机制

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

---

## 8. OpenClaw 插件配置

### 8.1 插件配置

```json
{
  "plugins": {
    "claw-memory": {
      "enabled": true,
      "autoSave": true,
      "saveMode": "qa",
      "dataDir": "~/.openclaw/claw-memory",
      "scheduler": {
        "enabled": true,
        "deduplicateTime": "01:00",
        "dailyTime": "02:00",
        "weeklyTime": "03:00",
        "monthlyTime": "04:00"
      }
    }
  }
}
```

### 8.2 配置说明

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `enabled` | `true` | 是否启用插件 |
| `autoSave` | `true` | 是否自动保存对话 |
| `saveMode` | `"qa"` | 保存模式：`qa` 仅 Q&A，`full` 完整对话 |
| `dataDir` | `~/.openclaw/claw-memory` | 数据存储目录 |
| `scheduler.enabled` | `true` | 是否启用定时任务 |
| `scheduler.deduplicateTime` | `"01:00"` | 去重任务执行时间 |
| `scheduler.dailyTime` | `"02:00"` | 每日总结执行时间 |
| `scheduler.weeklyTime` | `"03:00"` | 每周总结执行时间 |
| `scheduler.monthlyTime` | `"04:00"` | 每月总结执行时间 |

---

## 9. OpenClaw Hooks

### 9.1 message:sent

- **触发时机**: 消息发送时
- **功能**:
  1. 解析消息内容，提取 Q&A 对
  2. 调用 OpenClaw 内置 LLM 提取元数据（tags, keywords, importance）
  3. 保存到 SQLite 数据库
- **错误处理**: 静默失败，不阻塞消息发送

### 9.2 agent:bootstrap

- **触发时机**: Agent 上下文构建前
- **功能**:
  1. 调用 `get_summary` 获取本周记忆摘要
  2. 注入到 bootstrap 上下文
- **注入内容**:
  ```markdown
  ## 记忆摘要

  本周主要讨论了：
  - 技术话题：React Hooks, TypeScript
  - 项目进展：完成了用户认证模块

  重要事项：
  - 需要 review 代码
  ```

---

## 10. 实体关系图查询

### 10.1 查询功能

#### 获取实体直接关联

返回与指定实体直接相连的其他实体及其关系类型。

```typescript
{
  entity: string,
  relations: Array<{
    target: string,
    type: "related" | "parent" | "similar" | "co_occur",
    weight: number
  }>
}
```

#### 多跳图查询

支持 2-5 跳的图遍历，返回网络结构。

```typescript
{
  nodes: Array<{
    id: string,
    name: string,
    type: string
  }>,
  edges: Array<{
    source: string,
    target: string,
    type: string,
    weight: number
  }>
}
```

#### 关系统计

```typescript
{
  most_connected: Array<{ entity: string, count: number }>,
  relation_types: Record<string, number>,
  total_relations: number
}
```

### 10.2 HTML 可视化

- **拖拽布局** - 节点可拖拽重新排列
- **点击详情** - 点击节点显示关联信息
- **缩放/平移** - 支持鼠标滚轮缩放和拖拽平移
- **视觉设计** - 圆形节点（不同颜色代表类型）、不同线型边（关系类型）、边的粗细（权重）

---

## 11. 层级标签可视化

### 11.1 标签树

- 可折叠的树形结构
- 显示标签使用统计、层级分布
- 支持折叠/展开

### 11.2 标签统计

- 使用频率柱状图
- 层级分布饼图
- 最近使用列表

---

## 12. LLM 通用配置

### 12.1 配置结构

```typescript
export interface LLMConfig {
  format: 'openai' | 'anthropic' | 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
}
```

### 12.2 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| LLM_FORMAT | 格式类型 | openai |
| LLM_BASE_URL | API基础URL | https://api.openai.com/v1 |
| LLM_API_KEY | API密钥 | - |
| LLM_MODEL | 模型名称 | gpt-4o-mini |

### 12.3 请求格式

- `openai`: OpenAI 官方 API `/v1/chat/completions`
- `anthropic`: Anthropic API `/v1/messages`
- `openai-compatible`: 兼容格式，使用 OpenAI 格式调用其他 API

---

## 13. 文件存储

### 13.1 目录结构

```
memories/
├── 2026/
│   └── 03/
│       └── 02/
│           ├── abc123.md
│           └── def456.md
└── memory.db
```

### 13.2 文件格式

```markdown
# Memory: abc123

**Created**: 2026-03-02 14:30:00
**Summary**: 讨论了 React Hooks 的最佳实践
**Importance**: 0.8

## Tags
- 技术/前端/React
- 任务/开发

## Entities
- React Hooks (concept)
- useState (keyword)

## Content

[用户]: 请解释一下 React Hooks 的使用方式

[助手]: React Hooks 是 React 16.8 引入的新特性...

---

## Action Items
- [ ] 整理 React Hooks 最佳实践文档
```

---

## 14. Agent Tools

| 工具 | 描述 | 参数 |
|------|------|------|
| `memory_save` | 保存对话到记忆 | `content`, `metadata` |
| `memory_search` | 搜索记忆 | `query`, `timeRange`, `tags`, `limit` |
| `memory_summary` | 获取记忆摘要 | `period`, `date` |
| `memory_context` | 获取加权上下文 | `query`, `maxTokens` |

---

## 15. 技术栈

- **语言**: TypeScript (Node.js 18+)
- **数据库**: better-sqlite3 (SQLite Node.js 绑定)
- **CLI**: Commander.js
- **类型**: TypeScript 5.x with strict mode
- **测试**: Vitest (TDD)
- **可选嵌入**: OpenAI text-embedding-3-small (Phase 4)

---

## 16. 项目结构

```
claw-memory/
├── src/
│   ├── index.ts              # 插件入口
│   ├── config.ts             # 配置管理
│   ├── hooks/
│   │   └── message.ts        # message:sent Hook
│   ├── tools/
│   │   └── memory.ts         # Agent 工具
│   ├── services/
│   │   ├── storage.ts        # SQLite 存储
│   │   ├── llm.ts            # LLM 元数据提取
│   │   ├── summarizer.ts     # 总结生成
│   │   └── scheduler.ts      # 定时任务
│   └── types.ts              # 类型定义
├── openclaw.plugin.json      # 插件清单
├── package.json
└── tsconfig.json
```

---

## 17. 实现路线图

### Phase 1: MVP
- [ ] 项目初始化 (package.json, tsconfig)
- [ ] SQLite 数据模型 (schema.ts, repository.ts)
- [ ] 记忆存储/检索核心功能

### Phase 2: 增强
- [ ] 层级标签管理
- [ ] 实体关系图
- [ ] 定时总结/去重

### Phase 3: 集成
- [ ] OpenClaw hook 集成
- [ ] 插件配置系统

### Phase 4: 优化
- [ ] 语义搜索（可选）
- [ ] 性能优化
- [ ] 导入/导出功能

---

## 附录：参考项目

- [Letta/MemGPT](https://github.com/letta-ai/letta) - 记忆管理架构
- [LightRAG](https://github.com/HKUDS/LightRAG) - 图结构检索
- [MemOS](https://github.com/MemTensor/MemOS) - 记忆操作系统
