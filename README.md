# Claw-Memory

<p align="center">
  <strong>轻量级 AI 记忆系统 - 为 OpenClaw 和 Claude Code 提供持久化上下文</strong>
</p>

<p align="center">
  <a href="#特性">特性</a> •
  <a href="#架构">架构</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#使用方法">使用方法</a> •
  <a href="#api-参考">API 参考</a> •
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

- 🧠 **双层记忆存储** - 原始对话 + 结构化知识，完整保留上下文
- 🔗 **图结构关联** - 关键词、标签、主体以图的形式组织，支持多跳检索
- ⏰ **时间维度组织** - 按天/周/月/年组织记忆，智能时间衰减权重
- 🏷️ **层级标签系统** - 支持多级标签分类，如 `技术/前端/React`
- 🔌 **MCP 协议支持** - 原生支持 Claude Code 和 OpenClaw 调用
- 💾 **轻量级部署** - SQLite + 本地文件，无需额外数据库服务
- 🎯 **智能检索** - 多维度权重计算，限制条数和 Token 大小
- 🤖 **LLM 元数据提取** - 自动提取标签、关键词、主题和重要性评分
- 📝 **增量摘要更新** - LLM 单次调用同时更新会话摘要和整体摘要
- ✅ **待办事项管理** - 支持 day/week/month 周期的待办管理
- ⏱️ **定时任务系统** - 自动每日/每周/每月总结，自动去重
- 📊 **标签可视化** - CLI 生成静态 HTML 报告，展示标签树和统计
- 🔍 **实体关系图查询** - MCP 工具查询实体关联，D3.js 可视化

## 架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         OpenClaw / Claude Code                   │
└───────────────────────────────┬─────────────────────────────────┘
                                │ MCP Protocol (Stdio)
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Claw-Memory MCP Server                      │
├─────────────────────────────────────────────────────────────────┤
│  MCP Tools:                                                     │
│  ├── save_memory        保存会话记忆（含 LLM 元数据提取）         │
│  ├── search_memory      检索相关记忆                              │
│  ├── get_context        获取上下文（按权重加载）                  │
│  ├── get_summary        获取时间周期总结                          │
│  ├── list_memories      列出记忆列表                            │
│  ├── get_entity_relations    查询实体直接关联                   │
│  ├── query_entity_graph      多跳关系图查询                      │
│  └── get_relation_stats      关系统计                            │
│                                                                 │
│  Scheduler:                                                      │
│  ├── 01:00 去重任务                                             │
│  ├── 02:00 每日总结                                             │
│  ├── 03:00 每周总结                                             │
│  └── 04:00 每月总结                                             │
└─────────────────────────────────────────────────────────────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
┌───────────────┐       ┌───────────────┐       ┌───────────────┐
│    SQLite     │       │  本地文件      │       │     LLM       │
│   (元数据)    │       │  (对话内容)    │       │  (元数据提取)  │
└───────────────┘       └───────────────┘       └───────────────┘
```

### 数据模型

```
memories (记忆表)
├── id, content_path, created_at
├── importance, access_count
├── token_count
└── summary, integrated_summary (JSON)

entities (实体表 - 含层级)
├── id, name, type, parent_id
├── level, embedding
└── type: keyword | tag | subject | person | project

memory_entities (关联表)
├── memory_id, entity_id
└── relevance

entity_relations (实体关系图)
├── source_id, target_id
├── relation_type, weight
└── 支持: related | parent | similar

time_buckets (时间桶)
├── date, memory_count
└── summary, summary_generated_at

todos (待办事项)
├── id, content, period
├── completed_at, created_at
└── type: day | week | month
```

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/openclaw/claw-memory.git
cd claw-memory

# 安装依赖
npm install

# 构建项目
npm run build
```

### 启动 MCP 服务

```bash
# 构建后启动服务
npm run start

# 或使用 CLI
node dist/index.js serve

# 指定数据目录（默认 ./memories）
node dist/index.js serve --data-dir ./data

# 指定端口（CLI 参数）
node dist/index.js serve --port 18790
```

### 配置 Claude Code

在 Claude Code 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "claw-memory": {
      "command": "node",
      "args": ["/path/to/claw-memory/dist/index.js", "serve"]
    }
  }
}
```

## 使用方法

### 保存记忆

```typescript
// 通过 MCP 工具调用
const result = await mcp.callTool("save_memory", {
  content: "用户讨论了 React Hooks 的使用...",
  metadata: {
    tags: ["技术/前端/React"],
    subjects: ["React Hooks", "状态管理"],
    keywords: ["useState", "useEffect", "useCallback"],
    importance: 0.8,
    summary: "讨论了 React Hooks 的最佳实践"
  },
  userId: "default"
});
```

### 检索记忆

```typescript
// 搜索相关记忆
const memories = await mcp.callTool("search_memory", {
  query: "React Hooks 怎么用",
  timeRange: "month",  // today/week/month/year/all
  tags: ["技术/前端"],
  limit: 10,
  maxTokens: 4000
});

// 获取上下文（自动按权重加载）
const context = await mcp.callTool("get_context", {
  query: "上次讨论的 React 项目",
  maxTokens: 8000
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

### 获取周期总结

```typescript
// 获取本周总结
const summary = await mcp.callTool("get_summary", {
  period: "week",  // day/week/month
  date: "2026-03-03"
});
```

### 列出记忆

```typescript
const memories = await mcp.callTool("list_memories", {
  limit: 20,
  offset: 0
});
```

## API 参考

### MCP Tools

| 工具 | 描述 |
|-----|------|
| `save_memory` | 保存会话记忆，自动处理实体和关联，LLM 提取元数据 |
| `search_memory` | 多维度检索记忆 |
| `get_context` | 获取加权上下文，限制 Token 数 |
| `get_summary` | 获取时间周期总结 |
| `list_memories` | 列出指定条件的记忆 |
| `delete_memory` | 删除指定记忆 |
| `get_entity_relations` | 查询实体的直接关联 |
| `query_entity_graph` | 多跳查询实体关系图（默认2跳，最大5跳） |
| `get_relation_stats` | 获取关系统计 |

### CLI 命令

```bash
# 启动 MCP 服务
claw-memory serve [options]

# 选项:
#   -p, --port <port>           服务端口 (默认: 18790)
#   -d, --data-dir <dir>       数据目录 (默认: ./memories)
#   -s, --scheduler-disabled    禁用定时任务

# 初始化数据库
claw-memory init [options]

# 选项:
#   -d, --data-dir <dir>  数据目录 (默认: ./memories)

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
npm run dev          # 开发模式（热重载）
npm run start        # 启动 MCP 服务
npm run test         # 运行测试
npm run test:watch  # 测试监听模式
npm run lint         # 代码检查
npm run format       # 代码格式化
```

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|-----|-------|------|
| `LLM_FORMAT` | `openai` | LLM 格式：`openai`、`anthropic` 或 `openai-compatible` |
| `LLM_BASE_URL` | 供应商默认 | API 基础 URL |
| `LLM_API_KEY` | - | **必需** - LLM API Key |
| `LLM_MODEL` | 供应商默认 | LLM 模型名称 |
| `SCHEDULER_ENABLED` | `true` | 启用定时任务 |
| `SCHEDULER_DEDUPE_TIME` | `01:00` | 去重任务执行时间 (HH:mm) |
| `SCHEDULER_DAILY_TIME` | `02:00` | 每日总结执行时间 (HH:mm) |
| `SCHEDULER_WEEKLY_TIME` | `03:00` | 每周总结执行时间 (HH:mm) |
| `SCHEDULER_MONTHLY_TIME` | `04:00` | 每月总结执行时间 (HH:mm) |

#### LLM 提供商配置示例

**OpenAI:**
```bash
export LLM_FORMAT=openai
export LLM_API_KEY=sk-xxxxx
export LLM_MODEL=gpt-4o-mini
```

**Anthropic (Claude):**
```bash
export LLM_FORMAT=anthropic
export LLM_API_KEY=sk-ant-xxxxx
export LLM_MODEL=claude-3-haiku-20240307
```

**OpenAI 兼容 API (如 MiniMax, 智谱AI):**
```bash
export LLM_FORMAT=openai-compatible
export LLM_BASE_URL=https://api.minimax.chat/v1
export LLM_API_KEY=your-api-key
export LLM_MODEL=abab6.5s-chat
```

### 数据目录

通过 CLI 参数指定：

```bash
node dist/index.js serve --data-dir ./memories
```

数据将存储在 `./memories/` 目录下：
```
memories/
├── 2026/
│   └── 03/
│       └── 03/
│           └── {uuid}.md    # 记忆内容文件
└── memory.db                 # SQLite 数据库
```

## 项目结构

```
claw-memory/
├── src/
│   ├── index.ts              # CLI 入口 & MCP 服务
│   ├── config/
│   │   └── llm.ts           # LLM 配置 (支持多提供商)
│   ├── db/
│   │   ├── schema.ts        # 数据库 Schema
│   │   ├── repository.ts    # 记忆仓库
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
│   │   └── metadataExtractor.ts  # LLM 元数据提取
│   ├── mcp/
│   │   └── tools.ts         # MCP 工具定义
│   └── types.ts             # TypeScript 类型定义
├── tests/                   # 测试文件
├── docs/
│   └── plans/               # 设计文档
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

# 测试监听模式
npm run test:watch

# 代码格式化
npm run format

# 类型检查
npm run lint

# 构建
npm run build
```

## 路线图

- [x] 核心架构设计
- [x] MVP 实现
  - [x] SQLite 数据模型
  - [x] MCP 服务基础
  - [x] 记忆存储/检索
  - [x] LLM 元数据提取
  - [x] 增量摘要更新
  - [x] 多 LLM 提供商支持 (OpenAI, Anthropic, OpenAI 兼容)
- [x] 增强功能
  - [x] 层级标签管理工具
  - [x] 实体关系图查询
  - [x] 定时总结/去重 (scheduler)
- [ ] 集成
  - [ ] OpenClaw hook
  - [x] Claude Code MCP
- [ ] 优化
  - [ ] 语义搜索（可选）
  - [ ] 性能优化
  - [ ] 导入/导出

## 许可证

[MIT License](LICENSE)

## 致谢

- [OpenClaw](https://github.com/openclaw) - 无头 AI 智能体框架
- [Letta/MemGPT](https://github.com/letta-ai/letta) - 记忆管理灵感
- [LightRAG](https://github.com/HKUDS/LightRAG) - 图结构检索参考
- [MCP](https://modelcontextprotocol.io/) - 模型上下文协议

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/openclaw">OpenClaw</a> Community
</p>
