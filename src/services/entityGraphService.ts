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
}
