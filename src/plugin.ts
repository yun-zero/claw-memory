/**
 * ClawMemory - OpenClaw 记忆插件
 * 版本: 0.5.0 - 添加标签和实体提取功能
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema, jsonResult } from "openclaw/plugin-sdk";
import { getDatabase } from "./db/schema.js";
import { EntityRepository } from "./db/entityRepository.js";
import { MemoryRepository } from "./db/repository.js";
import { MetadataExtractor } from "./services/metadataExtractor.js";
import { TagService } from "./services/tagService.js";
import { getMemoryIndex } from "./services/memoryIndex.js";

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
    let memoryRepo: MemoryRepository;
    let metadataExtractor: MetadataExtractor;
    let tagService: TagService;

    try {
      db = getDatabase(pluginConfig.dataDir + "/memory.db");
      entityRepo = new EntityRepository(db);
      memoryRepo = new MemoryRepository(db);
      metadataExtractor = new MetadataExtractor();
      tagService = new TagService(db);
      console.log("[ClawMemory] Database and services initialized");
    } catch (error) {
      console.error("[ClawMemory] Failed to initialize database:", error);
    }

    // 注册工具
    api.registerTool({
      name: "clawmemory_search",
      label: "ClawMemory Search",
      description: "Search through conversation memories. Use this to recall prior work, decisions, user preferences, or important context from previous conversations.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query text"
          },
          limit: {
            type: "number",
            description: "Maximum number of results",
            default: 10
          }
        },
        required: ["query"]
      },
      execute: async (_toolCallId, params) => {
        const query = params.query as string;
        const limit = (params.limit as number) || 10;

        if (!db) {
          return jsonResult({ text: "Database not initialized" });
        }

        try {
          const memories = db.prepare(`
            SELECT id, summary, role, created_at
            FROM memories
            WHERE summary LIKE ?
            ORDER BY created_at DESC
            LIMIT ?
          `).all(`%${query}%`, limit) as any[];

          if (memories.length === 0) {
            return jsonResult({ text: "No memories found matching the query." });
          }

          const results = memories.map((m: any) => {
            const date = new Date(m.created_at).toLocaleDateString();
            return `[${date}] [${m.role}] ${m.summary || "(无摘要)"}`;
          }).join("\n\n");

          return jsonResult({ text: `Found ${memories.length} memories:\n\n${results}` });
        } catch (error) {
          return jsonResult({ text: `Error searching memories: ${error}` });
        }
      }
    });

    // 注册获取记忆摘要的工具
    api.registerTool({
      name: "clawmemory_summary",
      label: "ClawMemory Summary",
      description: "Get a summary of memories for a specific time period (day, week, or month). Use this to understand what has been discussed recently.",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["day", "week", "month"],
            description: "Time period for the summary"
          }
        },
        required: ["period"]
      },
      execute: async (_toolCallId, params) => {
        const period = params.period as string;

        if (!db) {
          return jsonResult({ text: "Database not initialized" });
        }

        try {
          const today = new Date();
          let startDate: Date;

          switch (period) {
            case "day":
              startDate = today;
              break;
            case "week":
              startDate = new Date(today);
              startDate.setDate(today.getDate() - today.getDay());
              break;
            case "month":
              startDate = new Date(today.getFullYear(), today.getMonth(), 1);
              break;
            default:
              startDate = today;
          }

          const startDateStr = startDate.toISOString().split("T")[0];

          const memories = db.prepare(`
            SELECT summary, role, created_at
            FROM memories
            WHERE created_at >= ?
            ORDER BY created_at DESC
            LIMIT 20
          `).all(startDateStr) as any[];

          if (memories.length === 0) {
            return jsonResult({ text: `No memories found for this ${period}.` });
          }

          const results = memories.map((m: any) => {
            const date = new Date(m.created_at).toLocaleDateString();
            return `[${date}] [${m.role}] ${m.summary || "(无摘要)"}`;
          }).join("\n");

          return jsonResult({ text: `Memory summary for ${period} (${memories.length} memories):\n\n${results}` });
        } catch (error) {
          return jsonResult({ text: `Error getting summary: ${error}` });
        }
      }
    });

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
          INSERT INTO memories (id, content_path, summary, role, created_at)
          VALUES (?, ?, ?, 'user', datetime('now'))
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
        // 使用 getMemoryIndex 获取结构化索引
        const index = await getMemoryIndex(db, {
          period: 'week',
          includeRecent: true,
          recentLimit: pluginConfig.maxContextMemories,
        });

        // 格式化为自然语言
        const contextParts: string[] = [];

        // 添加活跃领域
        if (index.activeAreas.tags.length > 0) {
          const tagNames = index.activeAreas.tags.map(t => t.name).join(', ');
          contextParts.push(`活跃领域: ${tagNames}`);
        }

        // 添加最近动态
        if (index.recentActivity.length > 0) {
          const recentParts = index.recentActivity.map((a: any) => {
            return `[${a.date}] ${a.summary}`;
          });
          contextParts.push(`\n最近动态:\n${recentParts.join('\n')}`);
        }

        // 添加待办事项
        if (index.todos.length > 0) {
          const todoText = index.todos.map((t: any) => `- ${t.content}`).join('\n');
          contextParts.push(`\n待办事项:\n${todoText}`);
        }

        if (contextParts.length === 0) return;

        const context = `\n\n--- 记忆索引 ---\n${contextParts.join('\n')}\n--- 记忆结束 ---\n`;

        return { prependContext: context };
      } catch (error) {
        console.error("[ClawMemory] Error:", error);
      }
    });

    // 注册 agent_end hook - 保存 AI 回复
    api.on("agent_end", async (event: any) => {
      console.log("[ClawMemory] agent_end hook triggered!");

      if (!db || !pluginConfig.autoSave) return;

      try {
        const messages = event.messages;
        if (!messages || !Array.isArray(messages)) {
          console.log("[ClawMemory] No messages in event");
          return;
        }

        console.log(`[ClawMemory] Processing ${messages.length} messages`);

        // 简单哈希函数
        const simpleHash = (str: string): string => {
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
          }
          return hash.toString(16);
        };

        // 处理每条消息
        for (const msg of messages) {
          // 提取 role
          const role = msg.role || msg.type || 'unknown';
          if (role !== 'assistant' && role !== 'ai') continue;

          // 提取内容
          let content = '';
          if (typeof msg.content === 'string') {
            content = msg.content;
          } else if (Array.isArray(msg.content)) {
            // 处理数组格式 [{ type: 'text', text: '...' }]
            content = msg.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('');
          } else if (typeof msg.content === 'object' && msg.content !== null) {
            // 处理对象格式 { text: '...' }
            content = msg.content.text || msg.content.content || JSON.stringify(msg.content);
          }

          // 过滤短内容
          if (!content || content.length < 10) continue;

          // 计算内容哈希
          const contentHash = simpleHash(content.substring(0, 500));

          // 检查是否已存在相同哈希
          const existing = db.prepare(`
            SELECT id FROM memories WHERE content_hash = ?
          `).get(contentHash) as any;

          if (existing) {
            console.log(`[ClawMemory] Skipping duplicate AI response (hash: ${contentHash.substring(0, 8)}...)`);
            continue;
          }

          // 获取旧的 integrated_summary（用于增量更新）
          const oldSummary = memoryRepo.getLatestIntegratedSummary();
          if (oldSummary) {
            console.log("[ClawMemory] Found existing summary, will update incrementally");
          }

          // 调用 LLM 提取元数据并更新概览
          let integratedSummary: any = null;
          try {
            const metadata = await metadataExtractor.extract(content, oldSummary || undefined);
            integratedSummary = {
              active_areas: metadata.subjects || [],
              key_topics: metadata.keywords || [],
              recent_summary: content.substring(0, 200),
            };
            console.log("[ClawMemory] Extracted metadata with incremental update");
          } catch (err) {
            console.error("[ClawMemory] Error extracting metadata:", err);
          }

          // 保存 AI 回复（带 integrated_summary）
          const memoryId = crypto.randomUUID();
          db.prepare(`
            INSERT INTO memories (id, content_path, summary, role, content_hash, integrated_summary, created_at)
            VALUES (?, ?, ?, 'assistant', ?, ?, datetime('now'))
          `).run(
            memoryId,
            "",
            content.substring(0, 200),
            contentHash,
            integratedSummary ? JSON.stringify(integratedSummary) : null
          );

          console.log(`[ClawMemory] Saved AI response: ${content.substring(0, 50)}... (hash: ${contentHash.substring(0, 8)}...)`);
        }
      } catch (error) {
        console.error("[ClawMemory] Error in agent_end:", error);
      }
    });

    console.log("[ClawMemory] All hooks registered");
  },
};

export default clawMemoryPlugin;
