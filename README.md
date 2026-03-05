# Claw-Memory

<p align="center">
  <strong>OpenClaw 记忆插件 - 自动保存对话，智能注入上下文</strong>
</p>

<p align="center">
  <a href="#特性">特性</a> •
  <a href="#架构">架构</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#使用方法">使用方法</a> •
  <a href="#配置">配置</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/typescript-5.0+-blue.svg" alt="TypeScript">
  <img src="https://img.shields.io/badge/node-18+-green.svg" alt="Node.js">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/status-alpha-orange.svg" alt="Status">
</p>

---

## 特性

- 🧠 **自动保存对话** - 每条消息自动保存 Q&A 到记忆
- 🔗 **图结构关联** - 关键词、标签、主体以图的形式组织，支持多跳检索
- ⏰ **时间维度组织** - 按天/周/月/年组织记忆，智能时间衰减权重
- 🏷️ **层级标签系统** - 支持多级标签分类，如 `技术/前端/React`
- 🔌 **OpenClaw 插件** - 原生集成，自动跟随 OpenClaw 启动
- 💾 **轻量级部署** - SQLite + 本地文件，无需额外数据库服务
- 🤖 **自动元数据提取** - 使用 OpenClaw 内置 LLM 提取标签、关键词
- ✅ **待办事项管理** - 支持 day/week/month 周期的待办管理
- ⏱️ **定时任务系统** - 自动每日/每周/每月总结，自动去重
- 📊 **标签可视化** - CLI 生成静态 HTML 报告，展示标签树和统计
- 🔍 **实体关系图查询** - 查询实体关联，D3.js 可视化

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                     OpenClaw Gateway                              │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │           @openclaw/claw-memory-plugin                  │    │
│  │                                                          │    │
│  │  Hooks:                                                 │    │
│  │  ├── message_received  ──▶ 提取用户消息实体，保存记忆  │    │
│  │  ├── before_agent_start ──▶ 注入记忆摘要到上下文       │    │
│  │  └── agent_end ──▶ 保存 AI 回复，提取实体，创建关系    │    │
│  │                                                          │    │
│  │  Tools:                                                 │    │
│  │  ├── clawmemory_search      搜索记忆                   │    │
│  │  ├── clawmemory_summary     获取记忆摘要               │    │
│  │  ├── clawmemory_create_todo 创建待办事项               │    │
│  │  ├── clawmemory_list_todos  列出待办事项               │    │
│  │  └── clawmemory_delete_todo 删除待办事项               │    │
│  │                                                          │    │
│  │  Scheduler:                                              │    │
│  │  ├── 01:00 去重任务                                   │    │
│  │  ├── 02:00 每日总结                                   │    │
│  │  ├── 03:00 每周总结                                   │    │
│  │  └── 04:00 每月总结                                   │    │
│  │                                                          │    │
│  │  内置 LLM 调用（复用 OpenClaw 配置）                  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │                                   │
│                              ▼                                   │
│              ┌───────────────────────────────────┐             │
│              │   ~/.openclaw/claw-memory/        │             │
│              │   ├── memory.db (SQLite WAL)      │             │
│              │   └── contents/                   │             │
│              │       └── YYYY/MM/{uuid}.md       │             │
│              └───────────────────────────────────┘             │
└─────────────────────────────────────────────────────────────────┘
```

### 数据模型

```
memories (记忆表)
├── id, content_path, summary, role
├── token_count, content_hash
├── importance, access_count, last_accessed_at
├── is_archived, is_duplicate, duplicate_of
└── integrated_summary (JSON)

entities (实体表 - 含层级)
├── id, name, type, parent_id
├── level, metadata
└── type: keyword | tag | subject | person | project

memory_entities (关联表)
├── memory_id, entity_id
├── relevance, source
└── source: auto | manual

entity_relations (实体关系图)
├── source_id, target_id
├── relation_type, weight, evidence_count
└── 支持: related | parent | similar | co_occur

time_buckets (时间桶)
├── date, memory_count
└── summary, summary_generated_at

todos (待办事项)
├── id, content, period, period_date
├── completed_at, created_at
└── period: day | week | month
```

## 快速开始

### 安装插件

```bash
# 安装插件
openclaw plugins install @openclaw/claw-memory

# 配置
openclaw config set plugins.claw-memory.enabled true

# 重启
openclaw gateway restart
```

### 配置

插件配置文件位于 `~/.openclaw/openclaw.json`：

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

### 配置选项说明

| 选项 | 默认值 | 说明 |
|------|--------|------|
| `enabled` | `true` | 是否启用插件 |
| `autoSave` | `true` | 是否自动保存对话 |
| `saveMode` | `"qa"` | 保存模式：`qa` 仅 Q&A，`full` 完整对话 |
| `dataDir` | `~/.openclaw/claw-memory` | 数据存储目录 |
| `scheduler.enabled` | `true` | 是否启用定时任务 |

## 使用方法

### 自动保存

插件会在每次消息发送后自动保存对话：
- 提取 Q&A 对
- 调用 LLM 提取元数据（标签、关键词、重要性）
- 保存到 SQLite 数据库

### 主动调用工具

Agent 可以主动调用以下工具：

```typescript
// 保存记忆
await tool("memory_save", {
  content: "用户讨论了 React Hooks 的使用...",
  metadata: {
    tags: ["技术/前端/React"],
    keywords: ["useState", "useEffect"],
    importance: 0.8
  }
});

// 搜索记忆
await tool("memory_search", {
  query: "React Hooks 怎么用",
  limit: 10
});

// 获取摘要
await tool("memory_summary", {
  period: "week"
});
```

### 检索权重计算

记忆按以下维度计算综合权重：

| 维度 | 权重范围 | 说明 |
|-----|---------|------|
| 实体匹配 | 0-40 | 匹配的关键词/主体数量 |
| 时间衰减 | 0-30 | 今天(30) > 本周(20) > 本月(10) > 本年(5) |
| 标签层级 | 0-20 | 层级越接近权重越高 |
| 重要性 | 0-10 | 访问频率 + 标记重要性 |

### CLI 命令

```bash
# 标签可视化
claw-memory tags tree [--output <file>]    # 生成标签树 HTML
claw-memory tags stats [--output <file>]   # 生成标签统计 HTML

# 实体关系图
claw-memory relations graph [--entity <name>] [--hops <n>] [--output <file>]
claw-memory relations stats [--output <file>]
```

### NPM Scripts

```bash
npm run build        # 编译 TypeScript
npm run test         # 运行测试
```

## 配置

### LLM 配置

插件使用 OpenClaw 已配置的 LLM，无需额外配置。

### 数据目录

数据存储在 `~/.openclaw/claw-memory/` 目录下：
```
~/.openclaw/claw-memory/
├── contents/                    # 完整记忆内容文件
│   └── 2026/                    # 按年份组织
│       └── 03/                  # 按月份组织
│           └── {uuid}.md        # 记忆文件
└── memory.db                    # SQLite 数据库 (WAL 模式)
```

**内容存储策略**：
- 完整内容保存到独立文件（按年/月组织）
- 数据库存储智能截断的摘要（最大 20000 字符）
- 自动计算 token 数量用于统计

## 项目结构

```
claw-memory/
├── src/
│   ├── index.ts              # CLI 入口
│   ├── plugin.ts             # OpenClaw 插件入口
│   ├── constants.ts          # 常量配置
│   ├── types.ts              # TypeScript 类型定义
│   ├── config/
│   │   ├── llm.ts           # LLM 配置（支持 OpenClaw 配置）
│   │   └── plugin.ts        # 插件配置管理
│   ├── db/
│   │   ├── schema.ts        # 数据库 Schema (WAL 模式优化)
│   │   ├── repository.ts     # 记忆仓库
│   │   ├── entityRepository.ts  # 实体仓库
│   │   └── todoRepository.ts   # 待办仓库
│   ├── services/
│   │   ├── memory.ts        # 记忆服务
│   │   ├── memoryIndex.ts   # 记忆索引服务
│   │   ├── retrieval.ts     # 检索逻辑
│   │   ├── summarizer.ts    # 总结服务
│   │   ├── scheduler.ts     # 定时任务服务
│   │   ├── tagService.ts    # 标签可视化服务
│   │   ├── entityGraphService.ts  # 实体关系图服务
│   │   ├── entityRelation.ts  # 实体关系构建
│   │   ├── metadataExtractor.ts  # LLM 元数据提取
│   │   └── cache.ts         # 缓存服务
│   ├── hooks/               # OpenClaw Hooks
│   │   └── todos.ts         # 待办事项 Hook
│   └── utils/               # 工具函数
│       ├── helpers.ts       # 通用工具
│       └── error.ts         # 错误处理
├── openclaw.plugin.json     # OpenClaw 插件清单
├── tests/                   # 测试文件
├── docs/
│   └── plans/              # 设计文档
├── package.json
├── tsconfig.json
└── README.md
```

## 开发

```bash
# 安装开发依赖
npm install

# 运行测试
npm test

# 构建
npm run build
```

## 路线图

- [x] 核心架构设计
- [x] SQLite 数据模型 (WAL 模式优化)
- [x] 记忆存储/检索
- [x] LLM 元数据提取（复用 OpenClaw 配置）
- [x] 增量摘要更新
- [x] 定时总结/去重 (scheduler)
- [x] 层级标签管理
- [x] 实体关系图查询
- [x] 实体共现关系自动创建
- [x] 内容文件存储（按年月组织）
- [x] OpenClaw 插件集成
  - [x] message_received Hook
  - [x] before_agent_start Hook
  - [x] agent_end Hook (保存实体关联)
  - [x] Agent Tools 注册
  - [ ] npm 发布
- [x] 待办事项管理
  - [x] create/list/delete 工具
  - [x] day/week/month 周期
- [ ] 优化
  - [ ] 语义搜索（可选）
  - [ ] 性能优化

## 许可证

[MIT License](LICENSE)

## 致谢

- [OpenClaw](https://github.com/openclaw) - 无头 AI 智能体框架
- [Letta/MemGPT](https://github.com/letta-ai/letta) - 记忆管理灵感
- [LightRAG](https://github.com/HKUDS/LightRAG) - 图结构检索参考

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/openclaw">OpenClaw</a> Community
</p>
