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
   * Generate collapsible tag tree HTML
   */
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

  /**
   * Generate tag statistics HTML
   */
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
      const date = new Date(r.lastUsedAt).toLocaleDateString('zh-CN');
      html += `    <li>${r.name} - ${date}</li>\n`;
    }

    html += `  </ul>
</body>
</html>`;

    return html;
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
