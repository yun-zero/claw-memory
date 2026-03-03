# 层级标签可视化实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现 CLI 命令生成静态 HTML 报告，展示标签树形结构和统计信息

**Architecture:** 使用现有 EntityRepository 查询标签数据，生成内联 CSS + 少量 JS 的单文件 HTML

**Tech Stack:** TypeScript, Node.js 内置功能（无新依赖）

---

## 准备工作

### Task 1: 创建开发分支

**Step 1: 创建并切换到新分支**

```bash
cd /home/ubuntu/openclaw/claw-memory
git checkout -b feature/tags-visualization
```

**Step 2: 验证分支**

```bash
git branch --show-current
```

Expected: `feature/tags-visualization`

---

## Task 2: 读取现有 EntityRepository

**Files:**
- Read: `src/db/entityRepository.ts`

**Step 1: 查看现有方法**

```bash
cat src/db/entityRepository.ts
```

了解现有的查询方法，特别是：
- `findChildren(parentId)` - 查询子实体
- `findByType(type)` - 按类型查询

---

## Task 3: 创建标签服务类

**Files:**
- Create: `src/services/tagService.ts`

**Step 1: 创建基础结构**

```typescript
// src/services/tagService.ts
import { getDatabase } from '../db/schema.js';
import { EntityRepository } from '../db/entityRepository.js';

export interface TagNode {
  name: string;
  level: number;
  memoryCount: number;
  usageCount: number;
  children: TagNode[];
}

export interface TagStats {
  totalTags: number;
  totalMemories: number;
  usageStats: { name: string; count: number }[];
  levelDistribution: Record<number, number>;
  recentlyUsed: { name: string; lastUsed: string }[];
}

export class TagService {
  private db: ReturnType<typeof getDatabase>;
  private entityRepo: EntityRepository;

  constructor() {
    this.db = getDatabase();
    this.entityRepo = new EntityRepository(this.db);
  }

  // TODO: 实现方法
}
```

**Step 2: 提交**

```bash
git add src/services/tagService.ts
git commit -m "feat: add TagService class skeleton"
```

---

## Task 4: 实现 getTagTree 方法

**Files:**
- Modify: `src/services/tagService.ts`

**Step 1: 实现 getTagTree 方法**

```typescript
async getTagTree(): Promise<{ totalTags: number; maxLevel: number; tree: TagNode[] }> {
  // 1. 获取所有标签
  const allTags = this.db.prepare(`
    SELECT e.*, COUNT(me.memory_id) as memory_count
    FROM entities e
    LEFT JOIN memory_entities me ON e.id = me.entity_id
    WHERE e.type = 'tag'
    GROUP BY e.id
  `).all() as any[];

  // 2. 构建映射
  const tagMap = new Map<string, TagNode>();
  for (const tag of allTags) {
    tagMap.set(tag.id, {
      name: tag.name,
      level: tag.level,
      memoryCount: tag.memory_count || 0,
      usageCount: tag.memory_count || 0,
      children: []
    });
  }

  // 3. 构建树形结构
  const rootTags: TagNode[] = [];
  let maxLevel = 0;

  for (const tag of allTags) {
    const node = tagMap.get(tag.id)!;
    maxLevel = Math.max(maxLevel, tag.level);

    if (tag.parent_id && tagMap.has(tag.parent_id)) {
      tagMap.get(tag.parent_id)!.children.push(node);
    } else {
      rootTags.push(node);
    }
  }

  return { totalTags: allTags.length, maxLevel, tree: rootTags };
}
```

**Step 2: 测试运行**

```bash
npx ts-node -e "
import { TagService } from './src/services/tagService.js';
const ts = new TagService();
ts.getTagTree().then(r => console.log('Tags:', r.totalTags)).catch(e => console.error(e));
"
```

Expected: 输出标签数量（可能为 0）

**Step 3: 提交**

```bash
git add src/services/tagService.ts
git commit -m "feat: implement getTagTree method"
```

---

## Task 5: 实现 getTagStats 方法

**Files:**
- Modify: `src/services/tagService.ts`

**Step 1: 实现 getTagStats 方法**

```typescript
async getTagStats(): Promise<TagStats> {
  // 总标签数
  const totalTags = this.db.prepare(`
    SELECT COUNT(*) as count FROM entities WHERE type = 'tag'
  `).get() as { count: number };

  // 总记忆数
  const totalMemories = this.db.prepare(`
    SELECT COUNT(*) as count FROM memories
  `).get() as { count: number };

  // 使用频率统计
  const usageStats = this.db.prepare(`
    SELECT e.name, COUNT(me.memory_id) as count
    FROM entities e
    JOIN memory_entities me ON e.id = me.entity_id
    WHERE e.type = 'tag'
    GROUP BY e.id
    ORDER BY count DESC
    LIMIT 20
  `).all() as { name: string; count: number }[];

  // 层级分布
  const levelDist = this.db.prepare(`
    SELECT level, COUNT(*) as count
    FROM entities
    WHERE type = 'tag'
    GROUP BY level
  `).all() as { level: number; count: number }[];

  const levelDistribution: Record<number, number> = {};
  for (const d of levelDist) {
    levelDistribution[d.level] = d.count;
  }

  // 最近使用
  const recentlyUsed = this.db.prepare(`
    SELECT e.name, MAX(me.created_at) as last_used
    FROM entities e
    JOIN memory_entities me ON e.id = me.entity_id
    WHERE e.type = 'tag'
    GROUP BY e.id
    ORDER BY last_used DESC
    LIMIT 10
  `).all() as { name: string; last_used: string }[];

  return {
    totalTags: totalTags.count,
    totalMemories: totalMemories.count,
    usageStats,
    levelDistribution,
    recentlyUsed
  };
}
```

**Step 2: 测试运行**

```bash
npx ts-node -e "
import { TagService } from './src/services/tagService.js';
const ts = new TagService();
ts.getTagStats().then(r => console.log('Stats:', JSON.stringify(r, null, 2))).catch(e => console.error(e));
"
```

Expected: 输出统计数据

**Step 3: 提交**

```bash
git add src/services/tagService.ts
git commit -m "feat: implement getTagStats method"
```

---

## Task 6: 实现 HTML 生成器 - 标签树

**Files:**
- Modify: `src/services/tagService.ts`

**Step 1: 添加 generateTreeHtml 方法**

```typescript
generateTreeHtml(data: { totalTags: number; maxLevel: number; tree: TagNode[] }): string {
  const renderNode = (node: TagNode, indent: number = 0): string => {
    const padding = '  '.repeat(indent);
    let html = `${padding}<div class="tag-item" data-level="${node.level}">\n`;
    html += `${padding}  <div class="tag-header" onclick="toggle(this)">\n`;
    html += `${padding}    <span class="toggle">${node.children.length ? '▶' : '·'}</span>\n`;
    html += `${padding}    <span class="tag-name">${node.name}</span>\n`;
    html += `${padding}    <span class="tag-count">(${node.memoryCount}条记忆, ${node.usageCount}次使用)</span>\n`;
    html += `${padding}  </div>\n`;

    if (node.children.length > 0) {
      html += `${padding}  <div class="tag-children" style="display:none;">\n`;
      for (const child of node.children) {
        html += renderNode(child, indent + 2);
      }
      html += `${padding}  </div>\n`;
    }

    html += `${padding}</div>\n`;
    return html;
  };

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>标签树 - ${data.totalTags} 个标签</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
    .tag-item { margin: 4px 0; }
    .tag-header { cursor: pointer; padding: 4px 8px; border-radius: 4px; }
    .tag-header:hover { background: #f0f0f0; }
    .toggle { display: inline-block; width: 20px; color: #666; }
    .tag-name { font-weight: 500; color: #333; }
    .tag-count { color: #999; font-size: 12px; margin-left: 8px; }
    .tag-children { margin-left: 20px; border-left: 1px solid #eee; padding-left: 8px; }
  </style>
</head>
<body>
  <h1>标签树 (${data.totalTags} 个标签, 最大层级: ${data.maxLevel})</h1>
  <script>
    function toggle(el) {
      const children = el.nextElementSibling;
      if (children) children.style.display = children.style.display === 'none' ? 'block' : 'none';
      const arrow = el.querySelector('.toggle');
      if (arrow) arrow.textContent = children.style.display === 'none' ? '▶' : '▼';
    }
  </script>
`;

  for (const node of data.tree) {
    html += renderNode(node);
  }

  html += `</body></html>`;
  return html;
}
```

**Step 2: 提交**

```bash
git add src/services/tagService.ts
git commit -m "feat: add generateTreeHtml method"
```

---

## Task 7: 实现 HTML 生成器 - 标签统计

**Files:**
- Modify: `src/services/tagService.ts`

**Step 1: 添加 generateStatsHtml 方法**

```typescript
generateStatsHtml(stats: TagStats): string {
  const maxUsage = Math.max(...stats.usageStats.map(s => s.count), 1);

  let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>标签统计</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
    h1, h2 { color: #333; }
    .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
    .stat-card { background: #f9f9f9; padding: 20px; border-radius: 8px; text-align: center; }
    .stat-number { font-size: 36px; font-weight: bold; color: #4a90d9; }
    .stat-label { color: #666; margin-top: 8px; }
    .bar-chart { margin: 20px 0; }
    .bar { background: #4a90d9; color: white; padding: 8px 12px; margin: 4px 0; border-radius: 4px; }
    .recent-list { list-style: none; padding: 0; }
    .recent-list li { padding: 8px; border-bottom: 1px solid #eee; }
    .level-grid { display: flex; gap: 10px; flex-wrap: wrap; }
    .level-badge { background: #e0e0e0; padding: 8px 16px; border-radius: 16px; }
  </style>
</head>
<body>
  <h1>标签统计</h1>

  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-number">${stats.totalTags}</div>
      <div class="stat-label">总标签数</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.totalMemories}</div>
      <div class="stat-label">总记忆数</div>
    </div>
    <div class="stat-card">
      <div class="stat-number">${stats.maxLevel !== undefined ? stats.maxLevel + 1 : '-'}</div>
      <div class="stat-label">层级深度</div>
    </div>
  </div>

  <h2>使用频率排行</h2>
  <div class="bar-chart">
`;

  for (const s of stats.usageStats) {
    const width = Math.round((s.count / maxUsage) * 100);
    html += `    <div class="bar" style="width: ${width}%">${s.name} (${s.count})</div>\n`;
  }

  html += `  </div>

  <h2>层级分布</h2>
  <div class="level-grid">
`;

  for (const [level, count] of Object.entries(stats.levelDistribution)) {
    html += `    <div class="level-badge">Level ${level}: ${count}</div>\n`;
  }

  html += `  </div>

  <h2>最近使用</h2>
  <ul class="recent-list">
`;

  for (const r of stats.recentlyUsed) {
    const date = new Date(r.lastUsed).toLocaleDateString('zh-CN');
    html += `    <li>${r.name} - ${date}</li>\n`;
  }

  html += `  </ul>
</body>
</html>`;

  return html;
}
```

**Step 2: 提交**

```bash
git add src/services/tagService.ts
git commit -m "feat: add generateStatsHtml method"
```

---

## Task 8: 集成到 CLI

**Files:**
- Modify: `src/index.ts`

**Step 1: 导入 TagService**

在文件顶部添加:
```typescript
import { TagService } from './services/tagService.js';
import { writeFile } from 'fs/promises';
```

**Step 2: 添加 tags 子命令**

```typescript
// 在现有命令后添加
.command('tags <action>')
.description('标签管理命令')
.option('-o, --output <file>', '输出文件路径')
.action(async (action, options) => {
  const tagService = new TagService();
  const outputFile = options.output || (action === 'tree' ? 'tags-tree.html' : 'tags-stats.html');

  if (action === 'tree') {
    const data = await tagService.getTagTree();
    const html = tagService.generateTreeHtml(data);
    await writeFile(outputFile, html);
    console.log(`标签树已生成: ${outputFile}`);
  } else if (action === 'stats') {
    const stats = await tagService.getTagStats();
    const html = tagService.generateStatsHtml(stats);
    await writeFile(outputFile, html);
    console.log(`标签统计已生成: ${outputFile}`);
  } else {
    console.error('未知命令: tree 或 stats');
    process.exit(1);
  }
});
```

**Step 3: 测试编译**

```bash
npm run build
```

**Step 4: 测试运行**

```bash
node dist/index.js tags tree -o /tmp/test-tags.html
cat /tmp/test-tags.html | head -30
```

Expected: 生成 HTML 文件

**Step 5: 提交**

```bash
git add src/index.ts
git commit -m "feat: add tags CLI commands"
```

---

## Task 9: 最终测试

**Step 1: 测试 tree 命令**

```bash
node dist/index.js tags tree
ls -la tags-tree.html
```

Expected: 生成 tags-tree.html

**Step 2: 测试 stats 命令**

```bash
node dist/index.js tags stats
ls -la tags-stats.html
```

Expected: 生成 tags-stats.html

---

## Task 10: 合并到主分支

**Step 1: 切换到主分支**

```bash
git checkout main
```

**Step 2: 合并功能分支**

```bash
git merge feature/tags-visualization
```

**Step 3: 推送到远程**

```bash
git push origin main
```

**Step 4: 删除功能分支（可选）**

```bash
git branch -d feature/tags-visualization
```
