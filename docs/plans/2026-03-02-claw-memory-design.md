# Claw-Memory 记忆系统设计文档

> 创建日期: 2026-03-02
> 状态: 已批准
> 作者: OpenClaw Community

## 1. 项目概述

### 1.1 定位

为 OpenClaw 和 Claude Code 提供轻量级、持久化的 AI 记忆系统。

### 1.2 核心目标

1. **存储**：保存 OpenClaw 会话记忆（原始对话 + 结构化知识）
2. **关联**：以图的形式关联记忆的关键词、标签、主体
3. **检索**：按相关性、时间、标签等多维度检索
4. **服务**：通过 MCP 协议供 OpenClaw 和 Claude Code 调用

### 1.3 设计原则

- **轻量级**：SQLite + 本地文件，无额外服务依赖
- **职责分离**：OpenClaw 负责提取，Memory 负责存储检索
- **增量维护**：每日定时总结、去重、关联（模拟人类睡眠整理）

---

## 2. 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         OpenClaw / Claude Code                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ MCP Protocol
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Claw-Memory MCP Server                      │
├─────────────────────────────────────────────────────────────────┤
│  Tools:                                                         │
│  ├── save_memory      保存会话记忆                              │
│  ├── search_memory    检索相关记忆                              │
│  ├── get_context      获取上下文（按权重加载）                   │
│  ├── get_summary      获取时间周期总结                          │
│  └── manage_entities  管理实体/标签                             │
└───────────────────────────────┬─────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│    SQLite     │       │  本地文件      │       │  定时任务      │
│   (元数据)    │       │  (对话内容)    │       │  (总结/去重)   │
└───────────────┘       └───────────────┘       └───────────────┘
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
```

### 3.2 表结构

```sql
-- 1. 记忆表
CREATE TABLE memories (
    id TEXT PRIMARY KEY,
    content_path TEXT NOT NULL,
    summary TEXT,
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
    date DATE PRIMARY KEY,
    memory_count INTEGER DEFAULT 0,
    summary TEXT,
    summary_generated_at TIMESTAMP,
    key_topics JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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

## 5. 定时任务（睡眠整理）

### 5.1 睡眠周期

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

### 5.2 默认配置

```yaml
scheduler:
  sleep_time:
    daily_summary: {hour: 2, minute: 0}
    deduplication: {hour: 3, minute: 0}
    relation_update: {hour: 4, minute: 0}
    weekly_summary: {day_of_week: "mon", hour: 3, minute: 30}
    monthly_summary: {day: 1, hour: 4, minute: 30}
```

---

## 6. OpenClaw Hook 集成

### 6.1 触发时机

会话结束时自动触发，通过 OpenClaw hooks 机制。

### 6.2 提取 Prompt

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

---

## 7. 文件存储

### 7.1 目录结构

```
memories/
├── 2026/
│   └── 03/
│       └── 02/
│           ├── abc123.md
│           └── def456.md
└── memory.db
```

### 7.2 文件格式

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

## 8. MCP API

### 8.1 Tools

| 工具 | 描述 |
|-----|------|
| `save_memory` | 保存会话记忆 |
| `search_memory` | 多维度检索记忆 |
| `get_context` | 获取加权上下文 |
| `get_summary` | 获取时间周期总结 |
| `list_memories` | 列出指定条件的记忆 |
| `delete_memory` | 删除指定记忆 |
| `manage_entities` | 管理实体/标签的 CRUD |

### 8.2 示例调用

```python
# 保存记忆
await mcp.call_tool("save_memory", {
    "content": "会话内容...",
    "metadata": {
        "tags": ["技术/前端/React"],
        "subjects": ["React Hooks"],
        "importance": 0.8
    }
})

# 检索记忆
await mcp.call_tool("search_memory", {
    "query": "React Hooks 怎么用",
    "time_range": "month",
    "limit": 10,
    "max_tokens": 4000
})
```

---

## 9. 技术栈

- **语言**: TypeScript (Node.js 18+)
- **数据库**: better-sqlite3 (SQLite Node.js 绑定)
- **MCP 框架**: @modelcontextprotocol/sdk
- **CLI**: Commander.js
- **类型**: TypeScript 5.x with strict mode
- **测试**: Vitest (TDD)
- **可选嵌入**: OpenAI text-embedding-3-small (Phase 4)

---

## 10. 项目结构 (TypeScript)

```
claw-memory/
├── src/
│   ├── index.ts           # CLI 入口
│   ├── db/
│   │   ├── schema.ts      # SQLite 表结构 + 初始化
│   │   └── repository.ts  # 数据访问层 (Repository)
│   ├── services/
│   │   ├── memory.ts      # 记忆服务
│   │   └── retrieval.ts   # 检索服务 (权重计算)
│   ├── mcp/
│   │   └── tools.ts       # MCP 工具定义
│   └── types.ts           # 类型定义
├── tests/
│   ├── db/
│   ├── services/
│   └── mcp/
├── package.json
├── tsconfig.json
└── README.md
```

---

## 11. 实现路线图

### Phase 1: MVP (当前阶段)
- [ ] 项目初始化 (package.json, tsconfig)
- [ ] SQLite 数据模型 (schema.ts, repository.ts)
- [ ] MCP 服务基础框架 (tools.ts, index.ts)
- [ ] 记忆存储/检索核心功能

### Phase 2: 增强
- [ ] 层级标签管理
- [ ] 实体关系图
- [ ] 定时总结/去重

### Phase 3: 集成
- [ ] OpenClaw hook 集成
- [ ] Claude Code MCP 配置

### Phase 4: 优化
- [ ] 语义搜索（可选）
- [ ] 性能优化
- [ ] 导入/导出功能

---

## 附录：参考项目

- [Letta/MemGPT](https://github.com/letta-ai/letta) - 记忆管理架构
- [LightRAG](https://github.com/HKUDS/LightRAG) - 图结构检索
- [MemOS](https://github.com/MemTensor/MemOS) - 记忆操作系统
- [MCP Memory Service](https://github.com/doobidoo/mcp-memory-service) - MCP 记忆服务
