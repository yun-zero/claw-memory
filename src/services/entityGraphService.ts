import Database from 'better-sqlite3';
import type { Entity, EntityRelation } from '../types.js';
import * as fs from 'fs';

/**
 * Entity node for graph visualization
 */
export interface EntityNode {
  id: string;
  name: string;
  type: 'keyword' | 'tag' | 'subject' | 'person' | 'project';
}

/**
 * Entity edge for graph visualization
 */
export interface EntityEdge {
  source: string;
  target: string;
  type: 'related' | 'parent' | 'similar' | 'co_occur';
  weight: number;
}

/**
 * Graph data structure for visualization
 */
export interface GraphData {
  nodes: EntityNode[];
  edges: EntityEdge[];
}

/**
 * Relation statistics
 */
export interface RelationStats {
  most_connected: { id: string; name: string; connection_count: number }[];
  relation_types: Record<string, number>;
  total_relations: number;
}

/**
 * Service for managing entity graph data and relationships
 */
export class EntityGraphService {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  /**
   * Get all entities and their relations as graph data
   */
  getGraphData(): GraphData {
    // Get all entities as nodes
    const entityRows = this.db.prepare(`
      SELECT id, name, type FROM entities
    `).all() as { id: string; name: string; type: string }[];

    const nodes: EntityNode[] = entityRows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type as EntityNode['type']
    }));

    // Get all relations as edges
    const relationRows = this.db.prepare(`
      SELECT source_id, target_id, relation_type, weight FROM entity_relations
    `).all() as { source_id: string; target_id: string; relation_type: string; weight: number }[];

    const edges: EntityEdge[] = relationRows.map(row => ({
      source: row.source_id,
      target: row.target_id,
      type: row.relation_type as EntityEdge['type'],
      weight: row.weight
    }));

    return { nodes, edges };
  }

  /**
   * Get relations for a specific entity
   */
  getEntityRelations(entityId: string): EntityEdge[] {
    const rows = this.db.prepare(`
      SELECT source_id, target_id, relation_type, weight
      FROM entity_relations
      WHERE source_id = ? OR target_id = ?
    `).all(entityId, entityId) as { source_id: string; target_id: string; relation_type: string; weight: number }[];

    return rows.map(row => ({
      source: row.source_id,
      target: row.target_id,
      type: row.relation_type as EntityEdge['type'],
      weight: row.weight
    }));
  }

  /**
   * Get statistics about entity relations
   */
  getRelationStats(): RelationStats {
    // Get total relations count
    const totalResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM entity_relations
    `).get() as { count: number };
    const total_relations = totalResult.count;

    // Get count by relation type
    const typeRows = this.db.prepare(`
      SELECT relation_type, COUNT(*) as count
      FROM entity_relations
      GROUP BY relation_type
    `).all() as { relation_type: string; count: number }[];

    const relation_types: Record<string, number> = {};
    for (const row of typeRows) {
      relation_types[row.relation_type] = row.count;
    }

    // Get most connected entities
    const connectedRows = this.db.prepare(`
      SELECT e.id, e.name, COUNT(er.id) as connection_count
      FROM entities e
      LEFT JOIN (
        SELECT source_id as entity_id, id FROM entity_relations
        UNION ALL
        SELECT target_id as entity_id, id FROM entity_relations
      ) er ON e.id = er.entity_id
      GROUP BY e.id, e.name
      ORDER BY connection_count DESC
      LIMIT 10
    `).all() as { id: string; name: string; connection_count: number }[];

    const most_connected = connectedRows.map(row => ({
      id: row.id,
      name: row.name,
      connection_count: row.connection_count
    }));

    return {
      most_connected,
      relation_types,
      total_relations
    };
  }

  /**
   * Create a relation between two entities
   */
  createRelation(sourceId: string, targetId: string, type: EntityEdge['type'], weight: number = 1.0): EntityRelation {
    const id = require('uuid').v4();
    const now = new Date();

    this.db.prepare(`
      INSERT INTO entity_relations (id, source_id, target_id, relation_type, weight, evidence_count, created_at)
      VALUES (?, ?, ?, ?, ?, 1, ?)
    `).run(id, sourceId, targetId, type, weight, now.toISOString());

    return {
      id,
      sourceId,
      targetId,
      relationType: type,
      weight,
      evidenceCount: 1,
      createdAt: now
    };
  }

  /**
   * Get subgraph around a specific entity (depth: number of hops)
   */
  getSubgraph(entityId: string, depth: number = 1): GraphData {
    const visited = new Set<string>();
    const nodes: EntityNode[] = [];
    const edges: EntityEdge[] = [];

    const collectNodes = (currentId: string, currentDepth: number) => {
      if (currentDepth > depth || visited.has(currentId)) return;
      visited.add(currentId);

      // Get entity info
      const entityRow = this.db.prepare(`
        SELECT id, name, type FROM entities WHERE id = ?
      `).get(currentId) as { id: string; name: string; type: string } | undefined;

      if (entityRow) {
        nodes.push({
          id: entityRow.id,
          name: entityRow.name,
          type: entityRow.type as EntityNode['type']
        });
      }

      // Get connected entities
      const connectedRows = this.db.prepare(`
        SELECT source_id, target_id, relation_type, weight
        FROM entity_relations
        WHERE source_id = ? OR target_id = ?
      `).all(currentId, currentId) as { source_id: string; target_id: string; relation_type: string; weight: number }[];

      for (const row of connectedRows) {
        const connectedId = row.source_id === currentId ? row.target_id : row.source_id;

        edges.push({
          source: row.source_id,
          target: row.target_id,
          type: row.relation_type as EntityEdge['type'],
          weight: row.weight
        });

        collectNodes(connectedId, currentDepth + 1);
      }
    };

    collectNodes(entityId, 0);

    return { nodes, edges };
  }

  /**
   * Generate HTML visualization for the entity graph using D3.js
   */
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
      .attr("width", width).attr("height", height)
      .call(d3.zoom().on("zoom", (event) => g.attr("transform", event.transform)));
    const g = svg.append("g");
    const link = g.append("g").selectAll("line").data(links).enter().append("line")
      .attr("class", "link").attr("stroke-width", d => Math.sqrt(d.value) * 2);
    const node = g.append("g").selectAll("g").data(nodes).enter().append("g")
      .attr("class", "node").call(d3.drag()
        .on("start", (e,d) => { if (!e.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag", (e,d) => { d.fx = e.x; d.fy = e.y; })
        .on("end", (e,d) => { if (!e.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; }));
    node.append("circle").attr("r", 15).attr("fill", d => color(d.group));
    node.append("text").text(d => d.id).attr("x", 18).attr("y", 4);
    simulation.on("tick", () => {
      link.attr("x1", d => d.source.x).attr("y1", d => d.source.y)
          .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
      node.attr("transform", d => "translate(" + d.x + "," + d.y + ")");
    });
  </script>
</body>
</html>`;
  }

  /**
   * Generate HTML statistics page for entity relations
   */
  generateStatsHtml(stats: RelationStats): string {
    const mostConnectedList = stats.most_connected.map(m => ({
      entity: m.name,
      count: m.connection_count
    }));
    const maxCount = Math.max(...mostConnectedList.map(m => m.count), 1);

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
  <div class="card"><h2>总关系数</h2><p style="font-size:36px;font-weight:bold;color:#4a90d9;">${stats.total_relations}</p></div>
  <div class="card">
    <h2>关联最多的实体</h2>
    <table><tr><th>实体</th><th>关联数</th></tr>
    ${mostConnectedList.map(m => `<tr><td>${m.entity}</td><td>${m.count}</td></tr>`).join('')}
    </table>
  </div>
  <div class="card">
    <h2>关系类型分布</h2>
    ${Object.entries(stats.relation_types).map(([type, count]) =>
      `<div class="bar" style="width:${Math.round(count/maxCount*100)}%">${type}: ${count}</div>`
    ).join('')}
  </div>
</body>
</html>`;
  }

  /**
   * Save HTML graph to file
   */
  saveGraphHtml(filePath: string): void {
    const graph = this.getGraphData();
    const html = this.generateGraphHtml(graph);
    fs.writeFileSync(filePath, html, 'utf-8');
  }

  /**
   * Save HTML stats to file
   */
  saveStatsHtml(filePath: string): void {
    const stats = this.getRelationStats();
    const html = this.generateStatsHtml(stats);
    fs.writeFileSync(filePath, html, 'utf-8');
  }
}
