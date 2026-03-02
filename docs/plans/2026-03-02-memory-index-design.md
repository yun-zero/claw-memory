# 记忆索引摘要与自动提取功能设计

**日期**: 2026-03-02

## 背景

当前 claw-memory 系统存在以下问题：
1. 标签和实体关系需要调用方手动传入，无法自动提取
2. OpenClaw/Claude Code 不知道数据库中有什么记忆，对话开始时无法利用历史信息
3. 缺少待办事项功能

## 目标

1. LLM 自动从 content 中提取 metadata（tags, keywords, subjects, importance, summary）
2. 提供记忆索引摘要 API，供 OpenClaw Hook 在对话开始时获取
3. 支持周期性待办事项（day/week/month）

---

## 功能设计

### 1. LLM 自动提取元数据

#### 实现方式
- 在 `saveMemory` 时调用 LLM 提取完整 metadata
- 无论是否传入 metadata，都使用 LLM 提取的结果

#### 数据分层
```
┌─────────────────────────────────────────┐
│           周期性总结数据                  │
│        (time_buckets 表)                 │
├─────────────────────────────────────────┤
│        LLM 提取的关系性数据              │
│   (memory_entities, entities 表)        │
├─────────────────────────────────────────┤
│          原始对话数据                     │
│      (memories.content_path 文件)        │
└─────────────────────────────────────────┘
```

#### 好处
- 原始数据永不丢失
- LLM 失败不影响基本功能
- 支持后续重新提取和修正

### 2. 记忆索引摘要 API

#### 数据分层（按变化频率排序）
```
1. 时间范围        ─────── 固定（查询时确定）
2. 活跃领域        ─────── 变化较慢（周/月）
3. 待办事项        ─────── 变化中等（随时添加/完成）
4. 最近动态        ─────── 变化频繁（每次对话）
```

#### 摘要输出示例
```
=== 记忆索引 (2026-02-24 ~ 2026-03-02) ===

【活跃领域】
- 技术/前端 (5), 项目/AI (3), 生活/旅行 (2)
- 关键词: React, TypeScript, Claude Code, OpenClaw

【待办事项】
- [ ] 完成 OpenClaw 记忆系统集成
- [ ] 配置 MCP Webhook 触发规则
- [ ] 学习 React Server Components

【最近动态】
- 今天: 讨论了 OpenClaw Hooks 机制
- 昨天: 保存了 React 组件设计笔记
- 前天: 查询了 Claude Code 使用文档
```

#### MCP 工具
```typescript
{
  name: "get_memory_index",
  params: {
    period: "week",      // day | week | month
    date?: "2026-03-02", // 可选，默认今天
    includeTodos: true,   // 是否包含待办
    includeRecent: true,  // 是否包含最近动态
    recentLimit: 5       // 最近动态数量
  }
}
```

### 3. 待办事项功能

#### 数据库设计
```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  period TEXT,           -- 'day' | 'week' | 'month'
  period_date TEXT,      -- 关联的日期
  created_at TEXT,
  completed_at TEXT,
  memory_id TEXT         -- 可选，关联到某个记忆
);
```

#### MCP 工具
```typescript
// 添加待办
{
  name: "add_todo",
  params: {
    content: "完成某事",
    period: "week",
    period_date: "2026-03-02"
  }
}

// 标记完成
{
  name: "complete_todo",
  params: {
    id: "todo_id"
  }
}

// 列出待办
{
  name: "list_todos",
  params: {
    period: "week",
    includeCompleted: false
  }
}
```

### 4. OpenClaw Hook 集成

```typescript
// hook-session-memory 调用
await callTool("get_memory_index", {
  period: "week",
  includeTodos: true,
  includeRecent: true
});
```

---

## 实现计划

### Phase 1: LLM 自动提取
1. 新增 `src/services/metadataExtractor.ts`
2. 修改 `src/services/memory.ts` 集成 LLM 提取

### Phase 2: 记忆索引 API
1. 新增 todos 表 schema
2. 新增 `TodoRepository`
3. 新增 `get_memory_index` MCP 工具

### Phase 3: 待办事项 MCP 工具
1. 新增 `add_todo`, `complete_todo`, `list_todos` 工具

### Phase 4: OpenClaw Hook（可选）
1. 提供自定义 Hook 示例代码
