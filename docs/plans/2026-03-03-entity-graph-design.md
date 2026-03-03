# 实体关系图查询设计

## 概述

为 Claw-Memory 实现实体关系图查询功能，包括 MCP 工具和静态 HTML 可视化。

## 需求

1. MCP 工具查询实体的直接关联
2. MCP 工具进行多跳查询（默认2跳，最大5跳），返回网络图 JSON
3. MCP 工具获取关系统计
4. CLI 命令生成静态 HTML 可视化关系图

## MCP 工具设计

### 1. get_entity_relations

查询实体的直接关联实体

**输入:**
```typescript
{
  entity_name: string  // 实体名称
}
```

**输出:**
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

### 2. query_entity_graph

多跳查询，返回网络图 JSON

**输入:**
```typescript
{
  start_entity: string,
  end_entity?: string,  // 可选，不填则返回从起点可达的所有节点
  max_hops: number      // 默认2，最大5
}
```

**输出:**
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

### 3. get_relation_stats

获取关系统计信息

**输出:**
```typescript
{
  most_connected: Array<{ entity: string, count: number }>,
  relation_types: Record<string, number>,
  total_relations: number
}
```

## CLI 命令设计

```bash
# 生成实体关系图 HTML 报告
claw-memory relations graph [--entity <name>] [--hops <n>] [--output <file>]

# 生成关系统计 HTML 报告
claw-memory relations stats [--output <file>]
```

## HTML 可视化设计

### 交互功能

- **拖拽布局** - 节点可拖拽重新排列
- **点击详情** - 点击节点显示关联信息
- **缩放/平移** - 支持鼠标滚轮缩放和拖拽平移

### 视觉设计

- **节点** - 圆形，不同颜色代表不同实体类型
- **边** - 不同线型代表不同关系类型
- **权重** - 边的粗细表示权重

### 技术实现

- 使用 D3.js 力导向图
- 单文件 HTML，内联所有依赖

## 数据来源

- `entities` 表 - 实体信息
- `entity_relations` 表 - 关系数据
- `memory_entities` 表 - 记忆-实体关联

## 实现方式

- 复用现有 `entity_relations` 表结构
- BFS 算法进行多跳查询
- D3.js 进行可视化渲染
