import Database from 'better-sqlite3';
import { EntityRepository } from '../db/entityRepository.js';

/**
 * TagNode represents a hierarchical tag structure
 */
export interface TagNode {
  name: string;
  level: number;
  memoryCount: number;
  usageCount: number;
  children: TagNode[];
}

/**
 * TagStats provides aggregated statistics about tags
 */
export interface TagStats {
  totalTags: number;
  totalMemories: number;
  usageStats: { name: string; count: number }[];
  levelDistribution: Record<number, number>;
  recentlyUsed: { name: string; lastUsedAt: Date }[];
}

/**
 * TagService provides tag management and statistics functionality
 */
export class TagService {
  private db: Database.Database;
  private entityRepo: EntityRepository;

  constructor(db: Database.Database) {
    this.db = db;
    this.entityRepo = new EntityRepository(db);
  }

  /**
   * Get all tags as a hierarchical tree structure with statistics
   */
  async getTagTree(): Promise<{ totalTags: number; maxLevel: number; tree: TagNode[] }> {
    // 1. Get all tags with memory count
    const allTags = this.db.prepare(`
      SELECT e.*, COUNT(me.memory_id) as memory_count
      FROM entities e
      LEFT JOIN memory_entities me ON e.id = me.entity_id
      WHERE e.type = 'tag'
      GROUP BY e.id
    `).all() as any[];

    // 2. Build mapping: tagId -> TagNode
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

    // 3. Build tree structure via parent_id
    const rootTags: TagNode[] = [];
    let maxLevel = 0;

    for (const tag of allTags) {
      const node = tagMap.get(tag.id)!;
      maxLevel = Math.max(maxLevel, tag.level || 0);

      if (tag.parent_id && tagMap.has(tag.parent_id)) {
        tagMap.get(tag.parent_id)!.children.push(node);
      } else {
        rootTags.push(node);
      }
    }

    return { totalTags: allTags.length, maxLevel, tree: rootTags };
  }

  /**
   * Get tag statistics
   */
  getTagStats(): TagStats {
    // Get all tag entities
    const tags = this.entityRepo.findByType('tag');

    // Get memory count per tag
    const memoryCountStmt = this.db.prepare(`
      SELECT e.name, COUNT(me.memory_id) as memory_count
      FROM entities e
      LEFT JOIN memory_entities me ON e.id = me.entity_id
      WHERE e.type = 'tag'
      GROUP BY e.id
    `);
    const memoryCounts = memoryCountStmt.all() as { name: string; memory_count: number }[];

    // Get usage count (relevance sum)
    const usageStmt = this.db.prepare(`
      SELECT e.name, SUM(me.relevance) as usage_count
      FROM entities e
      LEFT JOIN memory_entities me ON e.id = me.entity_id
      WHERE e.type = 'tag'
      GROUP BY e.id
    `);
    const usageCounts = usageStmt.all() as { name: string; usage_count: number }[];

    // Calculate level distribution
    const levelDistribution: Record<number, number> = {};
    for (const tag of tags) {
      levelDistribution[tag.level] = (levelDistribution[tag.level] || 0) + 1;
    }

    // Get total memories with tags
    const totalMemoriesStmt = this.db.prepare(`
      SELECT COUNT(DISTINCT memory_id) as count
      FROM memory_entities me
      JOIN entities e ON me.entity_id = e.id
      WHERE e.type = 'tag'
    `);
    const totalMemoriesResult = totalMemoriesStmt.get() as { count: number };

    // Get recently used tags
    const recentStmt = this.db.prepare(`
      SELECT e.name, MAX(me.created_at) as last_used_at
      FROM entities e
      JOIN memory_entities me ON e.id = me.entity_id
      WHERE e.type = 'tag'
      GROUP BY e.id
      ORDER BY last_used_at DESC
      LIMIT 10
    `);
    const recentlyUsed = recentStmt.all() as { name: string; last_used_at: string }[];

    // Build usage stats
    const usageStatsMap = new Map(usageCounts.map(u => [u.name, u.usage_count || 0]));
    const usageStats = tags.map(tag => ({
      name: tag.name,
      count: usageStatsMap.get(tag.name) || 0
    })).sort((a, b) => b.count - a.count);

    return {
      totalTags: tags.length,
      totalMemories: totalMemoriesResult.count,
      usageStats,
      levelDistribution,
      recentlyUsed: recentlyUsed.map(r => ({
        name: r.name,
        lastUsedAt: new Date(r.last_used_at)
      }))
    };
  }

  /**
   * Build hierarchical tag tree from flat tag list
   */
  private buildTagTree(tags: { name: string; level: number }[]): TagNode[] {
    const tagMap = new Map<string, TagNode>();
    const rootNodes: TagNode[] = [];

    // First pass: create all nodes
    for (const tag of tags) {
      tagMap.set(tag.name, {
        name: tag.name,
        level: tag.level,
        memoryCount: 0,
        usageCount: 0,
        children: []
      });
    }

    // Second pass: build hierarchy
    for (const tag of tags) {
      const node = tagMap.get(tag.name)!;

      if (tag.level === 0) {
        rootNodes.push(node);
      } else {
        // Find parent based on hierarchical naming (e.g., "a/b/c" has parent "a/b")
        const parts = tag.name.split('/');
        if (parts.length > 1) {
          const parentName = parts.slice(0, -1).join('/');
          const parent = tagMap.get(parentName);
          if (parent) {
            parent.children.push(node);
          } else {
            rootNodes.push(node);
          }
        } else {
          rootNodes.push(node);
        }
      }
    }

    return rootNodes;
  }
}
