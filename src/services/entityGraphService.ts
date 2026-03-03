import Database from 'better-sqlite3';
import type { Entity, EntityRelation } from '../types.js';

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
 * Query result for entity graph
 */
export interface EntityGraphQueryResult {
  path?: string[];
  nodes: EntityNode[];
  edges: EntityEdge[];
  found: boolean;
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
   * Get entity by name
   */
  private getEntityByName(name: string): { id: string; name: string; type: string } | undefined {
    const row = this.db.prepare(`
      SELECT id, name, type FROM entities WHERE name = ?
    `).get(name) as { id: string; name: string; type: string } | undefined;
    return row;
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
   * Get relations for a specific entity by name
   */
  getEntityRelations(entityName: string): EntityEdge[] {
    // First get the entity by name
    const entity = this.getEntityByName(entityName);
    if (!entity) {
      return [];
    }

    const rows = this.db.prepare(`
      SELECT source_id, target_id, relation_type, weight
      FROM entity_relations
      WHERE source_id = ? OR target_id = ?
    `).all(entity.id, entity.id) as { source_id: string; target_id: string; relation_type: string; weight: number }[];

    return rows.map(row => ({
      source: row.source_id,
      target: row.target_id,
      type: row.relation_type as EntityEdge['type'],
      weight: row.weight
    }));
  }

  /**
   * Query entity graph - find path or subgraph between entities
   */
  queryEntityGraph(startEntityName: string, endEntityName?: string, maxHops: number = 2): EntityGraphQueryResult {
    // Get start entity
    const startEntity = this.getEntityByName(startEntityName);
    if (!startEntity) {
      return { nodes: [], edges: [], found: false };
    }

    // If no end entity, return subgraph around start entity
    if (!endEntityName) {
      const subgraph = this.getSubgraph(startEntity.id, maxHops);
      return {
        nodes: subgraph.nodes,
        edges: subgraph.edges,
        found: true
      };
    }

    // Get end entity
    const endEntity = this.getEntityByName(endEntityName);
    if (!endEntity) {
      return { nodes: [], edges: [], found: false };
    }

    // Find path using BFS
    const path = this.findPath(startEntity.id, endEntity.id, maxHops);

    if (!path) {
      return { nodes: [], edges: [], found: false };
    }

    // Get nodes and edges for the path
    const nodes: EntityNode[] = [];
    const edges: EntityEdge[] = [];
    const nodeIds = new Set<string>();

    for (const entityId of path) {
      const entityRow = this.db.prepare(`
        SELECT id, name, type FROM entities WHERE id = ?
      `).get(entityId) as { id: string; name: string; type: string } | undefined;

      if (entityRow) {
        nodes.push({
          id: entityRow.id,
          name: entityRow.name,
          type: entityRow.type as EntityNode['type']
        });
        nodeIds.add(entityRow.id);
      }
    }

    // Get edges between the path nodes
    for (let i = 0; i < path.length - 1; i++) {
      const edgeRows = this.db.prepare(`
        SELECT source_id, target_id, relation_type, weight
        FROM entity_relations
        WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)
      `).all(path[i], path[i + 1], path[i + 1], path[i]) as { source_id: string; target_id: string; relation_type: string; weight: number }[];

      for (const row of edgeRows) {
        edges.push({
          source: row.source_id,
          target: row.target_id,
          type: row.relation_type as EntityEdge['type'],
          weight: row.weight
        });
      }
    }

    return {
      path,
      nodes,
      edges,
      found: true
    };
  }

  /**
   * Find shortest path between two entities using BFS
   */
  private findPath(startId: string, endId: string, maxHops: number): string[] | null {
    if (startId === endId) {
      return [startId];
    }

    const queue: { id: string; path: string[] }[] = [{ id: startId, path: [startId] }];
    const visited = new Set<string>([startId]);

    while (queue.length > 0) {
      const { id, path } = queue.shift()!;

      if (path.length > maxHops) {
        continue;
      }

      // Get connected entities
      const connectedRows = this.db.prepare(`
        SELECT source_id, target_id FROM entity_relations
        WHERE source_id = ? OR target_id = ?
      `).all(id, id) as { source_id: string; target_id: string }[];

      for (const row of connectedRows) {
        const connectedId = row.source_id === id ? row.target_id : row.source_id;

        if (connectedId === endId) {
          return [...path, connectedId];
        }

        if (!visited.has(connectedId)) {
          visited.add(connectedId);
          queue.push({ id: connectedId, path: [...path, connectedId] });
        }
      }
    }

    return null;
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
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
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
}
