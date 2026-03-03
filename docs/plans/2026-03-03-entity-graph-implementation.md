# 实体关系图查询实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 实现实体关系图查询功能，包括 MCP 工具和静态 HTML 可视化

**Architecture:** 使用 BFS 算法进行多跳查询，D3.js 力导向图实现可视化，复用现有 entity_relations 表

**Tech Stack:** TypeScript, D3.js, SQLite

---

## 准备工作

### Task 1: 创建开发分支

**Step 1: 创建并切换到新分支**

```bash
cd /home/ubuntu/openclaw/claw-memory
git checkout -b feature/entity-graph
```

**Step 2: 验证分支**

```bash
git branch --show-current
```

Expected: `feature/entity-graph`

---

## Task 2: 创建实体关系服务类

**Files:**
- Create: `src/services/entityGraphService.ts`

**Step 1: 创建基础结构**

```typescript
// src/services/entityGraphService.ts
import { getDatabase } from '../db/schema.js';

export interface EntityNode {
  id: string;
  name: string;
  type: string;
}

export interface EntityEdge {
  source: string;
  target: string;
  type: string;
  weight: number;
}

export interface GraphData {
  nodes: EntityNode[];
  edges: EntityEdge[];
}

export interface RelationStats {
  most_connected: Array<{ entity: string; count: number }>;
  relation_types: Record<string, number>;
  total_relations: number;
}

export class EntityGraphService {
  private db: ReturnType<typeof getDatabase>;

  constructor() {
    this.db = getDatabase();
  }
}
```

**Step 2: 提交**

```bash
git add src/services/entityGraphService.ts
git commit -m "feat: add EntityGraphService class skeleton"
```

---

## Task 3: 实现 getEntityRelations 方法

**Files:**
- Modify: `src/services/entityGraphService.ts`

**Step 1: 实现 getEntityRelations**

```typescript
async getEntityRelations(entityName: string): Promise<{
  entity: string;
  relations: Array<{ target: string; type: string; weight: number }>;
}> {
  // 查找实体
  const entity = this.db.prepare(`
    SELECT id, name FROM entities WHERE name = ? LIMIT 1
  `).get(entityName) as { id: string; name: string } | undefined;

  if (!entity) {
    return { entity: entityName, relations: [] };
  }

  // 查询直接关联（作为 source）
  const asSource = this.db.prepare(`
    SELECT e.name as target, er.relation_type as type, er.weight
    FROM entity_relations er
    JOIN entities e ON er.target_id = e.id
    WHERE er.source_id = ?
  `).all(entity.id) as Array<{ target: string; type: string; weight: number }>;

  // 查询直接关联（作为 target）
  const asTarget = this.db.prepare(`
    SELECT e.name as target, er.relation_type as type, er.weight
    FROM entity_relations er
    JOIN entities e ON er.source_id = e.id
    WHERE er.target_id = ?
  `).all(entity.id) as Array<{ target: string; type: string; weight: number }>;

  // 合并结果
  const relations = [...asSource, ...asTarget];

  return {
    entity: entity.name,
    relations
  };
}
```

**Step 2: 测试运行**

```bash
npx ts-node -e "
import { EntityGraphService } from './src/services/entityGraphService.js';
const svc = new EntityGraphService();
svc.getEntityRelations('技术').then(r => console.log(JSON.stringify(r, null, 2))).catch(e => console.error(e));
"
```

Expected: 返回关联数据（可能为空）

**Step 3: 提交**

```bash
git add src/services/entityGraphService.ts
git commit -m "feat: implement getEntityRelations method"
```

---

## Task 4: 实现 queryEntityGraph 方法（多跳查询）

**Files:**
- Modify: `src/services/entityGraphService.ts`

**Step 1: 实现 BFS 多跳查询**

```typescript
async queryEntityGraph(
  startEntity: string,
  endEntity?: string,
  maxHops: number = 2
): Promise<GraphData> {
  // 限制跳数
  maxHops = Math.min(Math.max(1, maxHops), 5);

  // 查找起点实体
  const start = this.db.prepare(`
    SELECT id, name, type FROM entities WHERE name = ? LIMIT 1
  `).get(startEntity) as { id: string; name: string; type: string } | undefined;

  if (!start) {
    return { nodes: [], edges: [] };
  }

  // BFS 查询
  const visited = new Set<string>();
  const nodes: EntityNode[] = [];
  const edges: EntityEdge[] = [];
  const queue: Array<{ id: string; name: string; type: string; hop: number }> = [];

  queue.push({ id: start.id, name: start.name, type: start.type, hop: 0 });
  visited.add(start.id);
  nodes.push({ id: start.id, name: start.name, type: start.type });

  while (queue.length > 0) {
    const current = queue.shift()!;

    if (current.hop >= maxHops) continue;

    // 查询关联（作为 source）
    const asSource = this.db.prepare(`
      SELECT e.id, e.name, e.type, er.relation_type, er.weight
      FROM entity_relations er
      JOIN entities e ON er.target_id = e.id
      WHERE er.source_id = ?
    `).all(current.id) as Array<{ id: string; name: string; type: string; relation_type: string; weight: number }>;

    // 查询关联（作为 target）
    const asTarget = this.db.prepare(`
      SELECT e.id, e.name, e.type, er.relation_type, er.weight
      FROM entity_relations er
      JOIN entities e ON er.source_id = e.id
      WHERE er.target_id = ?
    `).all(current.id) as Array<{ id: string; name: string; type: string; relation_type: string; weight: number }>;

    const allRelations = [
      ...asSource.map(r => ({ ...r, targetId: current.id, targetName: current.name })),
      ...asTarget.map(r => ({ ...r, targetId: r.id, targetName: r.name, isReverse: true }))
    ];

    for (const rel of allRelations) {
      if (!visited.has(rel.id) || (endEntity && rel.name === endEntity)) {
        if (!visited.has(rel.id)) {
          visited.add(rel.id);
          queue.push({ id: rel.id, name: rel.name, type: rel.type, hop: current.hop + 1 });
          nodes.push({ id: rel.id, name: rel.name, type: rel.type });
        }

        // 添加边
        edges.push({
          source: current.name,
          target: rel.name,
          type: rel.relation_type,
          weight: rel.weight
        });

        // 如果找到终点，提前结束
        if (endEntity && rel.name === endEntity) {
          return { nodes, edges };
        }
      }
    }
  }

  return { nodes, edges };
}
```

**Step 2: 测试运行**

```bash
npx ts-node -e "
import { EntityGraphService } from './src/services/entityGraphService.js';
const svc = new EntityGraphService();
svc.queryEntityGraph('技术', undefined, 2).then(r => console.log('Nodes:', r.nodes.length, 'Edges:', r.edges.length)).catch(e => console.error(e));
"
```

**Step 3: 提交**

```bash
git add src/services/entityGraphService.ts
git commit -m "feat: implement queryEntityGraph method with BFS"
```

---

## Task 5: 实现 getRelationStats 方法

**Files:**
- Modify: `src/services/entityGraphService.ts`

**Step 1: 实现 getRelationStats**

```typescript
async getRelationStats(): Promise<RelationStats> {
  // 关联最多的实体
  const mostConnected = this.db.prepare(`
    SELECT e.name as entity, COUNT(*) as count
    FROM entity_relations er
    JOIN entities e ON er.source_id = e.id OR er.target_id = e.id
    GROUP BY e.id
    ORDER BY count DESC
    LIMIT 10
  `).all() as Array<{ entity: string; count: number }>;

  // 关系类型分布
  const typeStats = this.db.prepare(`
    SELECT relation_type, COUNT(*) as count
    FROM entity_relations
    GROUP BY relation_type
  `).all() as Array<{ relation_type: string; count: number }>;

  const relation_types: Record<string, number> = {};
  for (const s of typeStats) {
    relation_types[s.relation_type] = s.count;
  }

  // 总关系数
  const total = this.db.prepare(`
    SELECT COUNT(*) as count FROM entity_relations
  `).get() as { count: number };

  return {
    most_connected: mostConnected,
    relation_types,
    total_relations: total.count
  };
}
```

**Step 2: 测试运行**

```bash
npx ts-node -e "
import { EntityGraphService } from './src/services/entityGraphService.js';
const svc = new EntityGraphService();
svc.getRelationStats().then(r => console.log(JSON.stringify(r, null, 2))).catch(e => console.error(e));
"
```

**Step 3: 提交**

```bash
git add src/services/entityGraphService.ts
git commit -m "feat: implement getRelationStats method"
```

---

## Task 6: 添加 MCP 工具

**Files:**
- Modify: `src/mcp/tools.ts`

**Step 1: 添加 get_entity_relations**

```typescript
{
  name: 'get_entity_relations',
  description: 'Get direct relations of an entity',
  inputSchema: {
    type: 'object',
    properties: {
      entity_name: { type: 'string', description: 'Entity name to query' }
    },
    required: ['entity_name']
  }
},
```

**Step 2: 添加 query_entity_graph**

```typescript
{
  name: 'query_entity_graph',
  description: 'Query entity graph with multi-hop traversal',
  inputSchema: {
    type: 'object',
    properties: {
      start_entity: { type: 'string', description: 'Start entity name' },
      end_entity: { type: 'string', description: 'End entity name (optional)' },
      max_hops: { type: 'number', description: 'Max hops (default 2, max 5)', default: 2 }
    },
    required: ['start_entity']
  }
},
```

**Step 3: 添加 get_relation_stats**

```typescript
{
  name: 'get_relation_stats',
  description: 'Get relationship statistics',
  inputSchema: {
    type: 'object',
    properties: {}
  }
},
```

**Step 4: 实现工具处理函数**

在工具处理逻辑中添加：

```typescript
case 'get_entity_relations': {
  const result = await entityGraphService.getEntityRelations(args.entity_name);
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

case 'query_entity_graph': {
  const result = await entityGraphService.queryEntityGraph(
    args.start_entity,
    args.end_entity,
    args.max_hops || 2
  );
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

case 'get_relation_stats': {
  const result = await entityGraphService.getRelationStats();
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}
```

**Step 5: 提交**

```bash
git add src/mcp/tools.ts
git commit -m "feat: add entity graph MCP tools"
```

---

## Task 7: 实现 HTML 可视化生成器

**Files:**
- Modify: `src/services/entityGraphService.ts`

**Step 1: 添加 generateGraphHtml 方法**

```typescript
generateGraphHtml(graph: GraphData): string {
  const nodesJson = JSON.stringify(graph.nodes.map(n => ({
    id: n.name,
    group: n.type
  })));

  const linksJson = JSON.stringify(graph.edges.map(e => ({
    source: e.source,
    target: e.target,
    type: e.type,
    value: e.weight
  })));

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>实体关系图 - ${graph.nodes.length} 节点</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    #graph { width: 100vw; height: 100vh; }
    .node { cursor: pointer; }
    .node circle { stroke: #fff; stroke-width: 2px; }
    .node text { font-size: 12px; }
    .link { stroke: #999; stroke-opacity: 0.6; }
    .tooltip { position: absolute; background: white; padding: 8px; border-radius: 4px; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
    #info { position: absolute; top: 10px; left: 10px; background: white; padding: 10px; border-radius: 4px; }
  </style>
</head>
<body>
  <div id="info">
    <h3>实体关系图</h3>
    <p>节点: ${graph.nodes.length}</p>
    <p>边: ${graph.edges.length}</p>
  </div>
  <div id="graph"></div>
  <script>
    const nodes = ${nodesJson};
    const links = ${linksJson};

    const width = window.innerWidth;
    const height = window.innerHeight;

    const color = d3.scaleOrdinal(d3.schemeCategory10);

    const simulation = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id(d => d.id).distance(100))
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const svg = d3.select("#graph").append("svg")
      .attr("width", width)
      .attr("height", height)
      .call(d3.zoom().on("zoom", (event) => {
        g.attr("transform", event.transform);
      }));

    const g = svg.append("g");

    const link = g.append("g")
      .selectAll("line")
      .data(links)
      .enter().append("line")
      .attr("class", "link")
      .attr("stroke-width", d => Math.sqrt(d.value) * 2);

    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .enter().append("g")
      .attr("class", "node")
      .call(d3.drag()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended));

    node.append("circle")
      .attr("r", 15)
      .attr("fill", d => color(d.group));

    node.append("text")
      .text(d => d.id)
      .attr("x", 18)
      .attr("y", 4);

    node.on("click", (event, d) => {
      const connected = links.filter(l => l.source.id === d.id || l.target.id === d.id);
      alert("关联: " + connected.map(l => l.source.id + " - " + l.target.id).join(", "));
    });

    simulation.on("tick", () => {
      link
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      node.attr("transform", d => "translate(" + d.x + "," + d.y + ")");
    });

    function dragstarted(event, d) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event, d) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event, d) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }
  </script>
</body>
</html>`;
}
```

**Step 2: 添加 generateStatsHtml 方法**

```typescript
generateStatsHtml(stats: RelationStats): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>关系统计</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 20px; max-width: 800px; margin: 0 auto; }
    h1, h2 { color: #333; }
    .card { background: #f5f5f5; padding: 20px; margin: 10px 0; border-radius: 8px; }
    .bar { background: #4a90d9; color: white; padding: 10px; margin: 5px 0; border-radius: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
  </style>
</head>
<body>
  <h1>实体关系统计</h1>

  <div class="card">
    <h2>总关系数</h2>
    <p style="font-size: 36px; font-weight: bold; color: #4a90d9;">${stats.total_relations}</p>
  </div>

  <div class="card">
    <h2>关联最多的实体</h2>
    <table>
      <tr><th>实体</th><th>关联数</th></tr>
      ${stats.most_connected.map(m => `<tr><td>${m.entity}</td><td>${m.count}</td></tr>`).join('')}
    </table>
  </div>

  <div class="card">
    <h2>关系类型分布</h2>
    ${Object.entries(stats.relation_types).map(([type, count]) =>
      `<div class="bar" style="width: ${count * 10}px">${type}: ${count}</div>`
    ).join('')}
  </div>
</body>
</html>`;
}
```

**Step 3: 提交**

```bash
git add src/services/entityGraphService.ts
git commit -m "feat: add HTML generators for entity graph visualization"
```

---

## Task 8: 添加 CLI 命令

**Files:**
- Modify: `src/index.ts`

**Step 1: 导入 EntityGraphService**

```typescript
import { EntityGraphService } from './services/entityGraphService.js';
import { writeFile } from 'fs/promises';
```

**Step 2: 添加 relations 子命令**

```typescript
.command('relations <action>')
.description('实体关系命令')
.option('-e, --entity <name>', '实体名称')
.option('-o, --output <file>', '输出文件')
.option('--hops <n>', '最大跳数', '2')
.action(async (action, options) => {
  const svc = new EntityGraphService();

  if (action === 'graph') {
    const graph = await svc.queryEntityGraph(
      options.entity || '技术',
      undefined,
      parseInt(options.hops)
    );
    const html = svc.generateGraphHtml(graph);
    const output = options.output || 'entity-graph.html';
    await writeFile(output, html);
    console.log(`关系图已生成: ${output}`);
  } else if (action === 'stats') {
    const stats = await svc.getRelationStats();
    const html = svc.generateStatsHtml(stats);
    const output = options.output || 'relation-stats.html';
    await writeFile(output, html);
    console.log(`统计数据已生成: ${output}`);
  }
});
```

**Step 3: 测试编译**

```bash
npm run build
```

**Step 4: 提交**

```bash
git add src/index.ts
git commit -m "feat: add relations CLI commands"
```

---

## Task 9: 最终测试

**Step 1: 测试 CLI 命令**

```bash
node dist/index.js relations graph -e "技术" --hops 2 -o /tmp/test-graph.html
ls -la /tmp/test-graph.html
```

**Step 2: 测试 stats 命令**

```bash
node dist/index.js relations stats -o /tmp/test-stats.html
ls -la /tmp/test-stats.html
```

---

## Task 10: 合并到主分支

**Step 1: 切换到主分支并合并**

```bash
git checkout main
git merge feature/entity-graph
git push origin main
```

**Step 2: 删除功能分支（可选）**

```bash
git branch -d feature/entity-graph
```
