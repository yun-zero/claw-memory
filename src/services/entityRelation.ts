/**
 * 实体关系自动构建服务
 * 负责自动构建实体间的父子关系和相似关系
 */

import Database from 'better-sqlite3';
import { EntityGraphService } from './entityGraphService.js';
import { MEMORY_CONFIG } from '../constants.js';

export class EntityRelationBuilder {
  private db: Database.Database;
  private graphService: EntityGraphService;

  constructor(db: Database.Database) {
    this.db = db;
    this.graphService = new EntityGraphService(db);
  }

  /**
   * 构建父子关系（层级关系）
   * 基于实体的类型和名称自动推断父子关系
   */
  buildParentRelations(): number {
    console.log('[EntityRelationBuilder] Building parent relations...');
    let count = 0;

    // 获取所有实体
    const entities = this.db.prepare(`
      SELECT id, name, type FROM entities
    `).all() as { id: string; name: string; type: string }[];

    // 规则1: 主题 -> 标签 -> 关键词 的层级关系
    const typeHierarchy: Record<string, string[]> = {
      'subject': [],
      'tag': ['subject'],
      'keyword': ['tag', 'subject'],
    };

    for (const entity of entities) {
      const parentTypes = typeHierarchy[entity.type] || [];
      
      // 查找可能的父实体（同一领域相关的父类型实体）
      for (const parentType of parentTypes) {
        // 简单规则：查找名称包含关系或同名的父实体
        const similarEntities = this.db.prepare(`
          SELECT id FROM entities 
          WHERE type = ? 
            AND (name LIKE ? OR name LIKE ?)
            AND id != ?
          LIMIT 1
        `).get(
          parentType,
          `%${entity.name}%`,
          `%${entity.name.substring(0, Math.min(3, entity.name.length))}%`,
          entity.id
        ) as { id: string } | undefined;

        if (similarEntities) {
          // 检查关系是否已存在
          const existing = this.db.prepare(`
            SELECT id FROM entity_relations 
            WHERE source_id = ? AND target_id = ? AND relation_type = 'parent'
          `).get(entity.id, similarEntities.id) as { id: string } | undefined;

          if (!existing) {
            // 创建父子关系
            this.graphService.createRelation(
              entity.id,
              similarEntities.id,
              'parent',
              0.5
            );
            count++;
          }
        }
      }
    }

    console.log(`[EntityRelationBuilder] Built ${count} parent relations`);
    return count;
  }

  /**
   * 构建相似关系
   * 基于共现频率和名称相似度
   */
  buildSimilarRelations(): number {
    console.log('[EntityRelationBuilder] Building similar relations...');
    let count = 0;

    // 基于共现频率构建相似关系
    const coOccurrences = this.db.prepare(`
      SELECT source_id, target_id, evidence_count
      FROM entity_relations
      WHERE relation_type = 'co_occur' AND evidence_count >= 3
    `).all() as { source_id: string; target_id: string; evidence_count: number }[];

    for (const coOccur of coOccurrences) {
      // 检查是否已有相似关系
      const existing = this.db.prepare(`
        SELECT id FROM entity_relations 
        WHERE ((source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?))
          AND relation_type = 'similar'
      `).get(
        coOccur.source_id,
        coOccur.target_id,
        coOccur.target_id,
        coOccur.source_id
      ) as { id: string } | undefined;

      if (!existing) {
        // 计算相似度权重（基于共现频率）
        const weight = Math.min(1.0, coOccur.evidence_count / 10);
        
        this.graphService.createRelation(
          coOccur.source_id,
          coOccur.target_id,
          'similar',
          weight
        );
        count++;
      }
    }

    // 基于名称相似度构建相似关系
    const entities = this.db.prepare(`
      SELECT id, name, type FROM entities
      WHERE type IN ('tag', 'keyword')
    `).all() as { id: string; name: string; type: string }[];

    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const e1 = entities[i];
        const e2 = entities[j];

        // 简单的名称相似度计算
        const similarity = this.calculateSimilarity(e1.name, e2.name);
        
        if (similarity > 0.6 && similarity < 1.0) {
          // 检查是否已有关系
          const existing = this.db.prepare(`
            SELECT id FROM entity_relations 
            WHERE ((source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?))
              AND relation_type IN ('similar', 'co_occur')
          `).get(e1.id, e2.id, e2.id, e1.id) as { id: string } | undefined;

          if (!existing) {
            this.graphService.createRelation(
              e1.id,
              e2.id,
              'similar',
              similarity * 0.5
            );
            count++;
          }
        }
      }
    }

    console.log(`[EntityRelationBuilder] Built ${count} similar relations`);
    return count;
  }

  /**
   * 清理过期关系
   * 移除证据数量过低的关系
   */
  cleanupStaleRelations(): number {
    console.log('[EntityRelationBuilder] Cleaning up stale relations...');
    
    // 删除证据数量少于2的关系
    const result = this.db.prepare(`
      DELETE FROM entity_relations 
      WHERE evidence_count < 2 
        AND relation_type = 'co_occur'
    `).run();

    console.log(`[EntityRelationBuilder] Cleaned up ${result.changes} stale relations`);
    return result.changes;
  }

  /**
   * 执行完整的实体关系构建流程
   */
  rebuildAllRelations(): void {
    console.log('[EntityRelationBuilder] Starting full rebuild...');
    
    const parentCount = this.buildParentRelations();
    const similarCount = this.buildSimilarRelations();
    const cleanupCount = this.cleanupStaleRelations();
    
    console.log(`[EntityRelationBuilder] Rebuild complete: +${parentCount} parent, +${similarCount} similar, -${cleanupCount} cleaned`);
  }

  /**
   * 简单的字符串相似度计算（基于共同字符）
   */
  private calculateSimilarity(str1: string, str2: string): number {
    const set1 = new Set(str1.toLowerCase());
    const set2 = new Set(str2.toLowerCase());
    
    let intersection = 0;
    for (const char of set1) {
      if (set2.has(char)) {
        intersection++;
      }
    }
    
    const union = set1.size + set2.size - intersection;
    return union > 0 ? intersection / union : 0;
  }
}
