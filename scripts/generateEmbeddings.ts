#!/usr/bin/env node
/**
 * 批量为现有实体生成 embedding
 * 运行: node scripts/generateEmbeddings.js
 */

// 直接使用 better-sqlite3 连接数据库，不走 schema 初始化
import Database from 'better-sqlite3';

const DB_PATH = '/home/ubuntu/.openclaw/claw-memory/memory.db';
import { generateEmbedding } from '../src/services/embedding.js';

async function main() {
  console.log('[Embedding] Starting batch embedding generation...');

  const db = new Database(DB_PATH);

  // 获取所有没有 embedding 的实体
  const entities = db.prepare(`
    SELECT id, name, type FROM entities WHERE embedding IS NULL
  `).all() as { id: string; name: string; type: string }[];

  console.log(`[Embedding] Found ${entities.length} entities without embedding`);

  let success = 0;
  let failed = 0;

  for (const entity of entities) {
    try {
      console.log(`[Embedding] Generating for: ${entity.name} (${entity.type})`);
      const embedding = await generateEmbedding(entity.name);

      db.prepare(`
        UPDATE entities SET embedding = ? WHERE id = ?
      `).run(JSON.stringify(embedding), entity.id);

      success++;
      console.log(`[Embedding] ✓ ${entity.name} done`);
    } catch (err) {
      failed++;
      console.error(`[Embedding] ✗ ${entity.name} failed:`, err);
    }
  }

  console.log(`\n[Embedding] Summary: ${success} success, ${failed} failed`);

  // 验证
  const stats = db.prepare(`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as with_embedding
    FROM entities
  `).get() as { total: number; with_embedding: number };

  console.log(`[Embedding] Total entities: ${stats.total}, with embedding: ${stats.with_embedding}`);

  process.exit(0);
}

main().catch(err => {
  console.error('[Embedding] Error:', err);
  process.exit(1);
});
