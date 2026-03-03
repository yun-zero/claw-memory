/**
 * ClawMemory - OpenClaw 记忆插件
 * 版本: 0.5.0 - 添加标签和实体提取功能
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { getDatabase } from "./db/schema.js";
import { EntityRepository } from "./db/entityRepository.js";
import { MetadataExtractor } from "./services/metadataExtractor.js";
import { TagService } from "./services/tagService.js";

// 插件配置
interface PluginConfig {
  enabled: boolean;
  autoSave: boolean;
  dataDir: string;
  maxContextMemories: number;
}

function getDefaultConfig(dataDir: string): PluginConfig {
  return {
    enabled: true,
    autoSave: true,
    dataDir: dataDir,
    maxContextMemories: 3,
  };
}

// 最小插件定义
const clawMemoryPlugin = {
  id: "claw-memory",
  name: "ClawMemory",
  description: "ClawMemory - Vector-based memory plugin for OpenClaw",
  kind: "memory",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    console.log("[ClawMemory] Plugin registered successfully");

    // 获取配置
    const dataDir = api.resolvePath("~/.openclaw/claw-memory");
    const pluginConfig = getDefaultConfig(dataDir);

    if (!pluginConfig.enabled) {
      console.log("[ClawMemory] Plugin disabled");
      return;
    }

    console.log("[ClawMemory] Starting with config:", JSON.stringify(pluginConfig));

    // 初始化数据库
    let db: any;
    let entityRepo: EntityRepository;
    let metadataExtractor: MetadataExtractor;
    let tagService: TagService;

    try {
      db = getDatabase(pluginConfig.dataDir + "/memory.db");
      entityRepo = new EntityRepository(db);
      metadataExtractor = new MetadataExtractor();
      tagService = new TagService(db);
      console.log("[ClawMemory] Database and services initialized");
    } catch (error) {
      console.error("[ClawMemory] Failed to initialize database:", error);
    }

    // 注册 message_received hook - 捕获原始用户消息并提取元数据
    api.on("message_received", async (event: any) => {
      console.log("[ClawMemory] message_received hook triggered!");

      if (!db || !pluginConfig.autoSave) return;

      try {
        const content = event.content;

        if (!content || typeof content !== "string" || content.length < 5) {
          return;
        }

        // 过滤系统消息
        if (content.startsWith("System:") || content.startsWith("Conversation info")) {
          return;
        }

        console.log("[ClawMemory] Processing:", content.substring(0, 30));

        // 1. 保存记忆
        const memoryId = crypto.randomUUID();
        db.prepare(`
          INSERT INTO memories (id, content_path, summary, created_at)
          VALUES (?, ?, ?, datetime('now'))
        `).run(memoryId, "", content.substring(0, 200));

        console.log("[ClawMemory] Memory saved:", memoryId);

        // 2. 提取元数据（标签、关键词、主题）
        try {
          const metadata = await metadataExtractor.extract(content);
          console.log("[ClawMemory] Extracted metadata:", JSON.stringify({
            tags: metadata.tags,
            keywords: metadata.keywords,
            subjects: metadata.subjects
          }));

          // 3. 保存实体并建立关联
          // 保存标签
          for (const tagName of metadata.tags) {
            let entity = entityRepo.findByName(tagName);
            if (!entity) {
              entity = entityRepo.create({ name: tagName, type: "tag", level: 1 });
            }
            // 建立关联
            db.prepare(`
              INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance, source)
              VALUES (?, ?, ?, 'auto')
            `).run(memoryId, entity.id, 1.0);
          }

          // 保存关键词
          for (const keyword of metadata.keywords) {
            let entity = entityRepo.findByName(keyword);
            if (!entity) {
              entity = entityRepo.create({ name: keyword, type: "keyword", level: 0 });
            }
            db.prepare(`
              INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance, source)
              VALUES (?, ?, ?, 'auto')
            `).run(memoryId, entity.id, 0.8);
          }

          // 保存主题
          for (const subject of metadata.subjects) {
            let entity = entityRepo.findByName(subject);
            if (!entity) {
              entity = entityRepo.create({ name: subject, type: "subject", level: 0 });
            }
            db.prepare(`
              INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance, source)
              VALUES (?, ?, ?, 'auto')
            `).run(memoryId, entity.id, 0.9);
          }

          console.log("[ClawMemory] Entities saved");
        } catch (err) {
          console.error("[ClawMemory] Error extracting metadata:", err);
        }

      } catch (error) {
        console.error("[ClawMemory] Error:", error);
      }
    });

    // 注册 before_agent_start hook - 注入记忆摘要
    api.on("before_agent_start", async (event: any) => {
      console.log("[ClawMemory] before_agent_start hook triggered!");

      if (!db) return;

      try {
        const memories = db.prepare(`
          SELECT id, summary, created_at
          FROM memories
          ORDER BY created_at DESC
          LIMIT ?
        `).all(pluginConfig.maxContextMemories) as any[];

        if (memories.length === 0) return;

        const contextParts = memories.map((m: any) => {
          const date = new Date(m.created_at).toLocaleDateString();
          return `[${date}] ${m.summary || "(无摘要)"}`;
        });

        const context = `\n\n--- 最近记忆 ---\n${contextParts.join("\n")}\n--- 记忆结束 ---\n`;

        return { prependContext: context };
      } catch (error) {
        console.error("[ClawMemory] Error:", error);
      }
    });

    console.log("[ClawMemory] All hooks registered");
  },
};

export default clawMemoryPlugin;
