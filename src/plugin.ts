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
import { generateEmbedding, generateEmbeddings, setLLMConfig } from "./services/embedding.js";
import { hybridSearch } from "./services/semanticSearch.js";

// 插件配置
interface PluginConfig {
  enabled: boolean;
  autoSave: boolean;
  dataDir: string;
  maxContextMemories: number;
  enableVector: boolean; // 向量功能开关
  llm?: {
    baseUrl: string;
    apiKey: string;
    model?: string;
  };
}

function getDefaultConfig(dataDir: string): PluginConfig {
  return {
    enabled: true,
    autoSave: true,
    dataDir: dataDir,
    maxContextMemories: 3,
    enableVector: false, // 默认禁用向量功能
  };
}

/**
 * 从配置文件加载 LLM 配置
 */
function loadLLMConfig(dataDir: string): { baseUrl: string; apiKey: string; model?: string } | null {
  const configPath = `${dataDir}/config.json`;
  try {
    const fs = require('fs');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config.llm?.apiKey) {
        console.log('[ClawMemory] Loaded LLM config from file');
        return config.llm;
      }
    }
  } catch (err) {
    console.error('[ClawMemory] Failed to load config file:', err);
  }
  return null;
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

    // 获取配置 - 先定义dataDir
    const dataDir = api.resolvePath("~/.openclaw/claw-memory");
    const pluginConfig = getDefaultConfig(dataDir);

    if (!pluginConfig.enabled) {
      console.log("[ClawMemory] Plugin disabled");
      return;
    }

    // 获取 LLM 配置 - 优先从配置文件读取
    let llmConfig = loadLLMConfig(dataDir);
    
    if (!llmConfig) {
      // 回退到从 OpenClaw 获取
      try {
        console.log('[ClawMemory] Trying to get LLM config from OpenClaw...');
        const modelsConfig = (api.config as any).models;
        if (modelsConfig?.providers) {
          const providers = modelsConfig.providers;
          const defaultProviderKey = Object.keys(providers)[0];
          const providerConfig = providers[defaultProviderKey];
          if (providerConfig) {
            let apiKey = '';
            if (providerConfig.apiKey) {
              if (typeof providerConfig.apiKey === 'object') {
                apiKey = (providerConfig.apiKey as any).value || (providerConfig.apiKey as any).__secret || '';
              } else {
                apiKey = providerConfig.apiKey;
              }
            }
            if (apiKey) {
              llmConfig = {
                baseUrl: providerConfig.baseUrl,
                apiKey: apiKey,
                model: providerConfig.models?.[0]?.id
              };
            }
          }
        }
      } catch (err) {
        console.error('[ClawMemory] Failed to get LLM config from OpenClaw:', err);
      }
    }
    
    // 设置 LLM 配置（如果可用）
    if (llmConfig) {
      setLLMConfig(llmConfig);
      console.log('[ClawMemory] LLM config initialized successfully');
    } else {
      console.warn('[ClawMemory] No LLM config available. Vector features will be disabled.');
    }

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

        console.log(`[ClawMemory] Search query: "${query}"`);

        if (!db) {
          return jsonResult({ text: "Database not initialized" });
        }

        try {
          // 使用混合搜索
          const results = await hybridSearch(query, limit);

          console.log(`[ClawMemory] Search found ${results.length} results for query: "${query}"`);

          if (results.length === 0) {
            return jsonResult({ text: "No memories found matching the query." });
          }

          // 修改返回格式，包含匹配类型和相关性得分
          const resultsText = results.map((r: any) => {
            const date = new Date(r.created_at).toLocaleDateString();
            const score = (r.relevanceScore * 100).toFixed(1);
            const matchType = r.matchType || 'unknown';
            return `[${date}] [${r.role}] [${matchType}] (${score}%) ${r.summary || "(无摘要)"}`;
          }).join("\n\n");

          return jsonResult({ text: `Found ${results.length} memories:\n\n${resultsText}` });
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

    // 注册手动更新元数据的工具
    api.registerTool({
      name: "clawmemory_update",
      label: "ClawMemory Manual Update",
      description: "手动更新指定记忆的标签、实体、关系和摘要。当用户增加新命令或需要手动更新记忆元数据时使用。",
      parameters: {
        type: "object",
        properties: {
          memoryId: {
            type: "string",
            description: "要更新的记忆ID"
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "新的标签列表"
          },
          keywords: {
            type: "array",
            items: { type: "string" },
            description: "新的关键词列表"
          },
          subjects: {
            type: "array",
            items: { type: "string" },
            description: "新的主题列表"
          },
          summary: {
            type: "string",
            description: "新的摘要"
          },
          regenerateEmbedding: {
            type: "boolean",
            description: "是否重新生成向量嵌入（需要向量功能启用）",
            default: false
          }
        },
        required: ["memoryId"]
      },
      execute: async (_toolCallId, params) => {
        const memoryId = params.memoryId as string;
        const tags = params.tags as string[] || [];
        const keywords = params.keywords as string[] || [];
        const subjects = params.subjects as string[] || [];
        const summary = params.summary as string;
        const regenerateEmbedding = params.regenerateEmbedding as boolean || false;

        if (!db) {
          return jsonResult({ text: "Database not initialized" });
        }

        try {
          // 1. 更新摘要
          if (summary) {
            db.prepare(`UPDATE memories SET summary = ? WHERE id = ?`).run(summary, memoryId);
            console.log(`[ClawMemory] Updated summary for memory ${memoryId}`);
          }

          // 2. 删除旧的实体关联
          db.prepare(`DELETE FROM memory_entities WHERE memory_id = ?`).run(memoryId);

          // 3. 重新添加标签实体
          const entitiesToEmbed: { name: string; id: string; type: string }[] = [];
          
          for (const tagName of tags) {
            let entity = entityRepo.findByName(tagName);
            if (!entity) {
              entity = entityRepo.create({ name: tagName, type: "tag", level: 1 });
            }
            db.prepare(`
              INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance, source)
              VALUES (?, ?, ?, 'manual')
            `).run(memoryId, entity.id, 1.0);
            if (entity?.id) entitiesToEmbed.push({ name: entity.name, id: entity.id, type: 'tag' });
          }

          for (const keyword of keywords) {
            let entity = entityRepo.findByName(keyword);
            if (!entity) {
              entity = entityRepo.create({ name: keyword, type: "keyword", level: 0 });
            }
            db.prepare(`
              INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance, source)
              VALUES (?, ?, ?, 'manual')
            `).run(memoryId, entity.id, 0.8);
            if (entity?.id) entitiesToEmbed.push({ name: entity.name, id: entity.id, type: 'keyword' });
          }

          for (const subject of subjects) {
            let entity = entityRepo.findByName(subject);
            if (!entity) {
              entity = entityRepo.create({ name: subject, type: "subject", level: 0 });
            }
            db.prepare(`
              INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance, source)
              VALUES (?, ?, ?, 'manual')
            `).run(memoryId, entity.id, 0.9);
            if (entity?.id) entitiesToEmbed.push({ name: entity.name, id: entity.id, type: 'subject' });
          }

          // 4. 如果启用向量功能且需要重新生成embedding
          if (regenerateEmbedding && entitiesToEmbed.length > 0) {
            try {
              const names = entitiesToEmbed.map(e => e.name);
              const embeddings = await generateEmbeddings(names);
              const updateStmt = db.prepare(`UPDATE entities SET embedding = ? WHERE id = ?`);
              for (let i = 0; i < entitiesToEmbed.length; i++) {
                if (embeddings[i]) {
                  updateStmt.run(JSON.stringify(embeddings[i]), entitiesToEmbed[i].id);
                }
              }
              console.log(`[ClawMemory] Regenerated ${embeddings.length} embeddings`);
            } catch (err) {
              console.error(`[ClawMemory] Failed to regenerate embeddings:`, err);
            }
          }

          return jsonResult({ 
            text: `Successfully updated memory ${memoryId}:\n- Tags: ${tags.join(', ')}\n- Keywords: ${keywords.join(', ')}\n- Subjects: ${subjects.join(', ')}\n- Summary: ${summary ? 'updated' : 'unchanged'}` 
          });
        } catch (error) {
          return jsonResult({ text: `Error updating memory: ${error}` });
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
        // 简单估算 token 数（中文字符约 1.5 token，英文约 0.25 token）
        const userTokenCount = Math.ceil(content.length / 2);
        db.prepare(`
          INSERT INTO memories (id, content_path, summary, role, token_count, created_at)
          VALUES (?, ?, ?, 'user', ?, datetime('now'))
        `).run(memoryId, "", content.substring(0, 20000), userTokenCount);

        console.log("[ClawMemory] Memory saved:", memoryId);

        // 2. 提取元数据（标签、关键词、主题）
        try {
          const metadata = await metadataExtractor.extract(content);
          console.log("[ClawMemory] Extracted metadata:", JSON.stringify({
            tags: metadata.tags,
            keywords: metadata.keywords,
            subjects: metadata.subjects
          }));

          // 3. 保存实体并建立关联（使用批量 embedding 生成）
          const entitiesToEmbed: { name: string; id: string; type: string }[] = [];

          // 保存标签
          for (const tagName of metadata.tags) {
            let entity = entityRepo.findByName(tagName);
            if (!entity) {
              entity = entityRepo.create({ name: tagName, type: "tag", level: 1 });
            }
            db.prepare(`
              INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance, source)
              VALUES (?, ?, ?, 'auto')
            `).run(memoryId, entity.id, 1.0);
            if (entity?.id) entitiesToEmbed.push({ name: entity.name, id: entity.id, type: 'tag' });
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
            if (entity?.id) entitiesToEmbed.push({ name: entity.name, id: entity.id, type: 'keyword' });
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
            if (entity?.id) entitiesToEmbed.push({ name: entity.name, id: entity.id, type: 'subject' });
          }

          // 批量生成 embedding（仅在启用向量功能时）
          if (pluginConfig.enableVector && entitiesToEmbed.length > 0) {
            try {
              const names = entitiesToEmbed.map(e => e.name);
              const embeddings = await generateEmbeddings(names);
              const updateStmt = db.prepare(`UPDATE entities SET embedding = ? WHERE id = ?`);
              for (let i = 0; i < entitiesToEmbed.length; i++) {
                if (embeddings[i]) {
                  updateStmt.run(JSON.stringify(embeddings[i]), entitiesToEmbed[i].id);
                }
              }
              console.log(`[ClawMemory] Batch generated ${embeddings.length} embeddings`);
            } catch (err) {
              console.error(`[ClawMemory] Failed to batch generate embeddings:`, err);
            }
          } else if (!pluginConfig.enableVector) {
            console.log(`[ClawMemory] Vector feature disabled, skipping embedding generation`);
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

      if (!db) {
        console.log("[ClawMemory] No database, returning");
        return;
      }

      try {
        // 检查并生成缺失的 embedding（仅在启用向量功能时）
        if (pluginConfig.enableVector) {
          console.log("[ClawMemory] Checking for entities without embedding...");
          const entitiesWithoutEmbedding = db.prepare(`
            SELECT id, name, type FROM entities WHERE embedding IS NULL LIMIT 10
          `).all() as { id: string; name: string; type: string }[];

          if (entitiesWithoutEmbedding.length > 0) {
            console.log(`[ClawMemory] Found ${entitiesWithoutEmbedding.length} entities without embedding, batch generating...`);
            try {
              const names = entitiesWithoutEmbedding.map(e => e.name);
              const embeddings = await generateEmbeddings(names);
              const updateStmt = db.prepare(`UPDATE entities SET embedding = ? WHERE id = ?`);
              for (let i = 0; i < entitiesWithoutEmbedding.length; i++) {
                if (embeddings[i]) {
                  updateStmt.run(JSON.stringify(embeddings[i]), entitiesWithoutEmbedding[i].id);
                }
              }
              console.log(`[ClawMemory] ✓ Batch generated ${embeddings.length} embeddings`);
            } catch (err) {
              console.error(`[ClawMemory] ✗ Failed to batch generate embeddings:`, err);
            }
          } else {
            console.log("[ClawMemory] All entities have embeddings");
          }
        } else {
          console.log("[ClawMemory] Vector feature disabled, skipping embedding generation");
        }
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

        if (contextParts.length === 0) {
          console.log("[ClawMemory] No context parts, returning undefined");
          return;
        }

        // 构建工具使用说明 - 更强调必须使用工具并正确解析结果
        const toolsHint = `
【重要 - 必须执行】用户询问过去的对话内容时，你必须使用 clawmemory_search 工具搜索记忆！不要假设没有记录！

搜索示例：
- 用户问"昨天聊了什么" → 调用 clawmemory_search(query="昨天")
- 用户问"股票" → 调用 clawmemory_search(query="股票")
- 用户问"A股" → 调用 clawmemory_search(query="A股")

当前已知用户关注：${index.activeAreas.tags.slice(0, 5).map((t: any) => t.name).join('、')} 等。

【关键】搜索工具返回格式说明：
- 结果在 tool result 的 content[0].text 中
- 如果返回 "Found X memories:" 表示找到了 X 条记录
- 如果返回 "No memories found" 才表示没有记录
- 【重要】只要搜索结果 > 0，你必须基于这些记忆内容回复用户，不能说"没有记录"！

【警告】如果你不调用搜索工具直接回复"没有记录"，将会丢失重要信息！
`;

        const context = `${toolsHint}\n\n--- 记忆索引 ---\n${contextParts.join('\n')}\n--- 记忆结束 ---\n`;

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
              recent_summary: content.substring(0, 20000),
            };
            console.log("[ClawMemory] Extracted metadata with incremental update");
          } catch (err) {
            console.error("[ClawMemory] Error extracting metadata:", err);
          }

          // 保存 AI 回复（带 integrated_summary）
          const memoryId = crypto.randomUUID();
          // 简单估算 token 数
          const aiTokenCount = Math.ceil(content.length / 2);
          db.prepare(`
            INSERT INTO memories (id, content_path, summary, role, token_count, content_hash, integrated_summary, created_at)
            VALUES (?, ?, ?, 'assistant', ?, ?, ?, datetime('now'))
          `).run(
            memoryId,
            "",
            content.substring(0, 20000),
            aiTokenCount,
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
