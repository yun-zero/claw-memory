# Claw-Memory OpenClaw 插件设计

> **Design Date:** 2026-03-03

**Goal:** 开发 OpenClaw 插件，实现自动保存对话到记忆，并在会话开始时注入记忆摘要

**Architecture:** 完全集成到 OpenClaw 插件系统，使用 OpenClaw 内置 LLM 进行元数据提取，直接操作本地 SQLite

**Tech Stack:** TypeScript, OpenClaw Plugin SDK, SQLite

---

## 1. 概述

### 1.1 目标

开发一个 OpenClaw 插件（`@openclaw/claw-memory`），实现：

1. **自动保存对话**：每条消息触发时，自动提取 Q&A 并保存到记忆
2. **会话开始时注入摘要**：使用 `agent:bootstrap` 钩子，在上下文构建前注入记忆摘要
3. **定时任务**：每日/每周/每月自动生成总结，自动去重
4. **提供工具**：注册 Agent 工具供主动调用

### 1.2 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │           @openclaw/claw-memory-plugin                  │   │
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
│              │   ~/.openclaw/claw-memory/        │              │
│              │   ├── memory.db (SQLite)          │              │
│              │   └── memories/ (对话文件)        │              │
│              └───────────────────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 配置

### 2.1 插件配置

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

### 2.2 配置说明

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

## 3. 功能模块

### 3.1 Hooks

#### 3.1.1 message:sent

- **触发时机**: 消息发送时
- **功能**:
  1. 解析消息内容，提取 Q&A 对
  2. 调用 OpenClaw 内置 LLM 提取元数据（tags, keywords, importance）
  3. 保存到 SQLite 数据库
- **错误处理**: 静默失败，不阻塞消息发送

#### 3.1.2 agent:bootstrap

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

### 3.2 Agent Tools

| 工具 | 描述 | 参数 |
|------|------|------|
| `memory_save` | 保存对话到记忆 | `content`, `metadata` |
| `memory_search` | 搜索记忆 | `query`, `timeRange`, `tags`, `limit` |
| `memory_summary` | 获取记忆摘要 | `period`, `date` |
| `memory_context` | 获取加权上下文 | `query`, `maxTokens` |

### 3.3 Scheduler

| 任务 | 时间 | 功能 |
|------|------|------|
| 去重 | 01:00 | 查找相似记忆，标记重复 |
| 日总结 | 02:00 | 生成当日记忆摘要 |
| 周总结 | 03:00 | 生成本周记忆摘要 |
| 月总结 | 04:00 | 生成本月记忆摘要 |

---

## 4. 数据模型

### 4.1 数据库表

```sql
-- 记忆表
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content_path TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  importance REAL DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  token_count INTEGER DEFAULT 0,
  summary TEXT,
  integrated_summary TEXT,
  is_archived INTEGER DEFAULT 0,
  is_duplicate INTEGER DEFAULT 0,
  duplicate_of TEXT
);

-- 实体表
CREATE TABLE entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  parent_id TEXT,
  level INTEGER DEFAULT 0,
  embedding BLOB,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (parent_id) REFERENCES entities(id)
);

-- 记忆-实体关联
CREATE TABLE memory_entities (
  memory_id TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  relevance REAL DEFAULT 1.0,
  PRIMARY KEY (memory_id, entity_id),
  FOREIGN KEY (memory_id) REFERENCES memories(id),
  FOREIGN KEY (entity_id) REFERENCES entities(id)
);

-- 实体关系图
CREATE TABLE entity_relations (
  source_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  relation_type TEXT NOT NULL,
  weight REAL DEFAULT 1.0,
  PRIMARY KEY (source_id, target_id, relation_type),
  FOREIGN KEY (source_id) REFERENCES entities(id),
  FOREIGN KEY (target_id) REFERENCES entities(id)
);

-- 时间桶（总结）
CREATE TABLE time_buckets (
  date TEXT PRIMARY KEY,
  memory_count INTEGER DEFAULT 0,
  summary TEXT,
  summary_generated_at DATETIME
);

-- 待办
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  period TEXT NOT NULL,
  period_date TEXT NOT NULL,
  completed_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 5. 目录结构

```
claw-memory-plugin/
├── src/
│   ├── index.ts              # 插件入口
│   ├── config.ts             # 配置管理
│   ├── hooks/
│   │   └── message.ts        # message:sent Hook
│   ├── tools/
│   │   └── memory.ts         # Agent 工具
│   ├── services/
│   │   ├── storage.ts        # SQLite 存储
│   │   ├── llm.ts           # LLM 元数据提取
│   │   ├── summarizer.ts    # 总结生成
│   │   └── scheduler.ts     # 定时任务
│   └── types.ts              # 类型定义
├── openclaw.plugin.json      # 插件清单
├── package.json
└── tsconfig.json
```

---

## 6. 安装使用

```bash
# 安装插件
openclaw plugins install @openclaw/claw-memory

# 配置
openclaw config set plugins.claw-memory.enabled true

# 重启
openclaw gateway restart
```

---

## 7. 实施阶段

### Phase 1: 基础功能
1. 插件骨架搭建
2. SQLite 存储服务
3. message:sent Hook 实现

### Phase 2: 工具注册
4. Agent Tools 注册
5. agent:bootstrap Hook 实现

### Phase 3: 定时任务
6. Scheduler 服务
7. 总结生成逻辑
8. 去重逻辑

### Phase 4: 发布
9. 完善配置
10. 测试和文档
11. npm 发布
