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
  <img src="https://img.shields.io/badge/python-3.10+-blue.svg" alt="Python">
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="License">
  <img src="https://img.shields.io/badge/status-alpha-orange.svg" alt="Status">
</p>

---

## 特性

- 🧠 **双层记忆存储** - 原始对话 + 结构化知识，完整保留上下文
- 🔗 **图结构关联** - 关键词、标签、主体以图的形式组织，支持多跳检索
- ⏰ **时间维度组织** - 按天/周/月/年组织记忆，智能时间衰减权重
- 🏷️ **层级标签系统** - 支持多级标签分类，如 `技术/前端/React`
- 🔄 **自动去重总结** - 每日定时合并重复记忆，生成日/周/月总结
- 🔌 **MCP 协议支持** - 原生支持 Claude Code 和 OpenClaw 调用
- 💾 **轻量级部署** - SQLite + 本地文件，无需额外数据库服务
- 🎯 **智能检索** - 多维度权重计算，限制条数和 Token 大小

## 架构

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

### 数据模型

```
memories (记忆表)
├── id, content_path, created_at
├── importance, access_count
└── token_count

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
```

## 快速开始

### 安装

```bash
# 克隆仓库
git clone https://github.com/openclaw/claw-memory.git
cd claw-memory

# 安装依赖
pip install -e .

# 或使用 uv
uv pip install -e .
```

### 启动 MCP 服务

```bash
# 启动服务
claw-memory serve

# 指定端口和数据目录
claw-memory serve --port 18790 --data-dir ./memories
```

### 配置 Claude Code

在 Claude Code 的 MCP 配置中添加：

```json
{
  "mcpServers": {
    "claw-memory": {
      "command": "uvx",
      "args": ["claw-memory", "serve"],
      "env": {
        "CLAW_MEMORY_DATA_DIR": "/path/to/memories"
      }
    }
  }
}
```

### 配置 OpenClaw Hook

在 OpenClaw 配置中添加会话结束钩子：

```yaml
hooks:
  session_end:
    - name: "save_to_memory"
      module: "claw_memory.hooks"
      config:
        mcp_endpoint: "http://localhost:18790"
        min_messages: 3
```

## 使用方法

### 保存记忆

OpenClaw 会话结束时自动触发，或手动调用：

```python
# 通过 MCP 工具调用
result = await mcp.call_tool("save_memory", {
    "content": "用户讨论了 React Hooks 的使用...",
    "metadata": {
        "tags": ["技术/前端/React"],
        "subjects": ["React Hooks", "状态管理"],
        "keywords": ["useState", "useEffect", "useCallback"],
        "importance": 0.8,
        "summary": "讨论了 React Hooks 的最佳实践"
    },
    "user_id": "default"
})
```

### 检索记忆

```python
# 搜索相关记忆
memories = await mcp.call_tool("search_memory", {
    "query": "React Hooks 怎么用",
    "time_range": "month",  # today/week/month/year/all
    "tags": ["技术/前端"],
    "limit": 10,
    "max_tokens": 4000
})

# 获取上下文（自动按权重加载）
context = await mcp.call_tool("get_context", {
    "query": "上次讨论的 React 项目",
    "max_tokens": 8000
})
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

```python
# 获取今日总结
summary = await mcp.call_tool("get_summary", {
    "period": "day",  # day/week/month
    "date": "2026-03-02"
})
```

## API 参考

### MCP Tools

| 工具 | 描述 |
|-----|------|
| `save_memory` | 保存会话记忆，自动处理实体和关联 |
| `search_memory` | 多维度检索记忆 |
| `get_context` | 获取加权上下文，限制 Token 数 |
| `get_summary` | 获取时间周期总结 |
| `list_memories` | 列出指定条件的记忆 |
| `delete_memory` | 删除指定记忆 |
| `manage_entities` | 管理实体/标签的 CRUD |
| `build_relations` | 手动触发实体关系构建 |

### CLI 命令

```bash
claw-memory serve          # 启动 MCP 服务
claw-memory summary        # 手动触发每日总结
claw-memory dedup          # 手动触发去重
claw-memory export         # 导出记忆数据
claw-memory import         # 导入记忆数据
claw-memory stats          # 查看统计信息
```

## 配置

### 环境变量

| 变量 | 默认值 | 说明 |
|-----|-------|------|
| `CLAW_MEMORY_DATA_DIR` | `./memories` | 数据存储目录 |
| `CLAW_MEMORY_DB_PATH` | `{DATA_DIR}/memory.db` | SQLite 数据库路径 |
| `CLAW_MEMORY_MAX_TOKENS` | `8000` | 默认最大 Token 数 |
| `CLAW_MEMORY_EMBEDDING_MODEL` | `text-embedding-3-small` | 嵌入模型（可选） |

### 配置文件

`config.yaml`:

```yaml
# 存储配置
storage:
  data_dir: ./memories
  content_format: markdown  # markdown | json

# 检索配置
retrieval:
  default_limit: 10
  max_tokens: 8000
  weights:
    entity_match: 0.4
    time_decay: 0.3
    tag_hierarchy: 0.2
    importance: 0.1

# 标签层级
tags:
  predefined:
    - 技术/前端/React
    - 技术/前端/Vue
    - 技术/后端/Python
    - 技术/后端/Go
    - 项目/Claw
    - 任务/开发
    - 任务/调试
    - 通用/日常

# 定时任务（模拟人类睡眠整理记忆）
scheduler:
  sleep_time:
    daily_summary: {hour: 2, minute: 0}       # 睡眠第一阶段：整理今日记忆
    deduplication: {hour: 3, minute: 0}       # 睡眠第二阶段：消除重复
    relation_update: {hour: 4, minute: 0}     # 睡眠第三阶段：建立关联
    weekly_summary: {day_of_week: "mon", hour: 3, minute: 30}   # 周一凌晨
    monthly_summary: {day: 1, hour: 4, minute: 30}              # 每月1日凌晨

# 嵌入配置（可选，用于语义搜索）
embedding:
  enabled: false
  provider: openai  # openai | local
  model: text-embedding-3-small
```

## 项目结构

```
claw-memory/
├── claw_memory/
│   ├── __init__.py
│   ├── server.py           # MCP 服务入口
│   ├── database.py         # SQLite 操作
│   ├── storage.py          # 文件存储
│   ├── entities.py         # 实体管理
│   ├── retrieval.py        # 检索逻辑
│   ├── scheduler.py        # 定时任务
│   ├── hooks.py            # OpenClaw hooks
│   └── cli.py              # CLI 命令
├── memories/               # 记忆存储目录
│   ├── 2026/
│   │   └── 03/
│   │       └── 02/
│   │           └── {uuid}.md
│   └── memory.db           # SQLite 数据库
├── docs/
│   └── plans/              # 设计文档
├── tests/
├── config.yaml
├── pyproject.toml
└── README.md
```

## 开发

```bash
# 安装开发依赖
pip install -e ".[dev]"

# 运行测试
pytest

# 代码格式化
ruff format .

# 类型检查
mypy claw_memory
```

## 路线图

- [x] 核心架构设计
- [ ] MVP 实现
  - [ ] SQLite 数据模型
  - [ ] MCP 服务基础
  - [ ] 记忆存储/检索
- [ ] 增强功能
  - [ ] 层级标签管理
  - [ ] 实体关系图
  - [ ] 定时总结/去重
- [ ] 集成
  - [ ] OpenClaw hook
  - [ ] Claude Code MCP
- [ ] 优化
  - [ ] 语义搜索（可选）
  - [ ] 性能优化
  - [ ] 导入/导出

## 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

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
