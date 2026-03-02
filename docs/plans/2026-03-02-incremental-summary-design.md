# 增量更新整体记忆摘要设计

**日期**: 2026-03-02

## 背景

当前 `get_memory_index` 每次调用时都需要 LLM 实时计算整体摘要，导致：
1. 每次查询都消耗 LLM tokens
2. 实时计算效率低
3. 无法体现"累积"效应

## 目标

在会话结束时，一次 LLM 调用同时完成：
1. 提取当前会话的 tags、keywords、summary
2. 整合整体摘要（包含历史累积信息）

后续查询直接返回缓存的摘要，无需 LLM 调用。

---

## 功能设计

### 1. 数据模型

```sql
-- memories 表新增字段
ALTER TABLE memories ADD COLUMN integrated_summary JSON;
```

```typescript
interface IntegratedSummary {
  active_areas: string[];  // ["技术/AI (10)", "金融/投资 (3)"]
  key_topics: string[];     // ["React", "OpenClaw", "股票"]
  recent_summary: string;   // "本周主要讨论了AI技术和金融投资..."
}
```

### 2. LLM Prompt 设计

```typescript
const EXTRACTION_PROMPT = `请从以下对话内容中提取结构化元数据，并整合已有的整体摘要：

当前对话内容：
{content}

已有整体摘要（请在此基础上增量更新）：
{existing_summary}

请以 JSON 格式返回：
{
  "tags": ["一级分类/二级分类"],
  "keywords": ["关键词1", "关键词2"],
  "subjects": ["主题1"],
  "importance": 0.0-1.0,
  "summary": "当前对话的一句话摘要",
  "integrated_summary": {
    "active_areas": ["领域名 (出现次数)"],
    "key_topics": ["主题1", "主题2"],
    "recent_summary": "整体摘要自然语言描述"
  }
}

注意：
- tags 使用层级结构
- integrated_summary 需整合历史信息，在已有基础上增加新领域
- 只返回 JSON，不要其他内容`;
```

### 3. 流程设计

```
session_end → saveMemory(content)
  │
  ├─→ 读取最新的 integrated_summary（从最新的 memory）
  │
  ├─→ 构建 LLM prompt（传入已有摘要）
  │
  ├─→ LLM 一次调用返回：
  │     - 当前会话元数据
  │     - 整合后的整体摘要
  │
  └─→ 存储到 memory 记录
        - tags, keywords, summary（当前会话）
        - integrated_summary（整体摘要）

get_memory_index()
  │
  └─→ 直接返回缓存的 integrated_summary（无需 LLM）
```

### 4. 边界情况

- **首次保存**：无历史摘要时，LLM 生成初始摘要
- **LLM 失败**：使用 fallback，integrated_summary 为空
- **摘要过期**：可选择定期重新生成（如每周）

---

## MCP 工具变更

### get_memory_index

```typescript
// 新增返回字段
interface MemoryIndex {
  // ... 现有字段
  integrated_summary?: IntegratedSummary;  // 新增：缓存的整体摘要
  summary_freshness?: 'fresh' | 'stale'; // 摘要新鲜度
}
```

---

## OpenClaw Hook 集成

```yaml
# session_start 时获取摘要
hooks:
  session_start:
    - name: memory_summary
      tool: get_memory_index
      inject_as: prepend_context

# 生成的上下文示例
"""
## 你的记忆概览

【活跃领域】
- 技术/AI (10), 金融/投资 (3), 生活/旅行 (2)

【关键词】
React, OpenClaw, 股票, 基金

【近期动态】
本周主要讨论了AI技术（OpenClaw、Claude Code）和金融投资...
"""
```

---

## 实现计划

### Phase 1: 数据库变更
1. 修改 memories 表，添加 integrated_summary 字段

### Phase 2: LLM Prompt 更新
1. 更新 MetadataExtractor 的 prompt，支持传入已有摘要
2. 修改 extract 方法，接收 existing_summary 参数

### Phase 3: 存储逻辑
1. 修改 MemoryService.saveMemory，传递已有摘要给 LLM
2. 存储整合后的 integrated_summary

### Phase 4: 查询优化
1. 修改 get_memory_index，优先返回缓存的摘要
2. 添加摘要新鲜度标记
