# 层级标签管理工具设计

## 概述

为 Claw-Memory 实现层级标签可视化管理工具，生成静态 HTML 报告展示标签树形结构和统计信息。

## 需求

1. CLI 命令生成标签树和统计 HTML 报告
2. 标签树支持折叠展开
3. 显示标签使用统计、层级分布、最近使用

## CLI 命令设计

```bash
# 生成标签树 HTML 报告（默认 output: tags-tree.html）
claw-memory tags tree [--output <file>]

# 生成标签统计 HTML 报告（默认 output: tags-stats.html）
claw-memory tags stats [--output <file>]
```

## 标签树 HTML 结构

```html
<!-- 可折叠的树形结构 -->
<div class="tag-tree">
  <div class="tag-item" data-level="0">
    <span class="tag-toggle">▶</span>
    <span class="tag-name">技术</span>
    <span class="tag-count">(15条记忆, 20次使用)</span>
    <div class="tag-children">
      <!-- 子标签 -->
    </div>
  </div>
</div>
```

## 标签统计 HTML 结构

```html
<!-- 使用频率柱状图 -->
<div class="chart-usage">
  <div class="bar" style="width: 80%">技术 (20)</div>
</div>

<!-- 层级分布饼图 -->
<div class="chart-levels">
  <div class="pie-segment" data-level="0">Level 0: 10</div>
</div>

<!-- 最近使用列表 -->
<div class="recent-tags">
  <li>React - 2026-03-03</li>
</div>
```

## 数据来源

使用现有的 EntityRepository 查询：
- `type = 'tag'` 的实体
- 通过 `parent_id` 构建层级关系
- 聚合 `memory_entities` 计算使用次数

## 实现方式

- 使用现有 `EntityRepository` 查询数据
- 纯 HTML + 内联 CSS + 少量 JS
- 单文件输出，无需服务器

## 新增依赖

无（使用 Node.js 内置功能）
