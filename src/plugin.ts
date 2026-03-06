/**
 * ClawMemory - OpenClaw 记忆插件
 * 版本: 0.6.0 - 移除向量功能，使用原生配置
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema, jsonResult } from "openclaw/plugin-sdk";
import { getDatabase } from "./db/schema.js";
import { EntityRepository } from "./db/entityRepository.js";
import { MemoryRepository } from "./db/repository.js";
import { MetadataExtractor } from "./services/metadataExtractor.js";
import { TagService } from "./services/tagService.js";
import { getMemoryIndex } from "./services/memoryIndex.js";
import { setLLMConfig } from "./config/llm.js";
import { EntityGraphService } from "./services/entityGraphService.js";
import { MEMORY_CONFIG } from "./constants.js";
import { smartTruncate, generateContentPath, writeContentToFile, estimateTokenCount } from "./utils/helpers.js";
import { Scheduler } from "./services/scheduler.js";
import { initTodos, createTodo, listTodos, deleteTodo } from "./hooks/todos.js";
import { EntityRelationBuilder } from "./services/entityRelation.js";

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

/**
 * 从OpenClaw原生配置获取LLM配置
 * 使用 api.config.models 获取模型配置
 */
function getLLMConfigFromOpenClaw(api: OpenClawPluginApi): { baseUrl: string; apiKey: string; model?: string } | null {
  try {
    const modelsConfig = (api.config as any).models;
    if (!modelsConfig?.providers) {
      console.log('[ClawMemory] No models config found in OpenClaw');
      return null;
    }

    const providers = modelsConfig.providers;
    const defaultProviderKey = Object.keys(providers)[0];
    if (!defaultProviderKey) {
      console.log('[ClawMemory] No default provider found');
      return null;
    }

    const providerConfig = providers[defaultProviderKey];
    if (!providerConfig) {
      console.log('[ClawMemory] Provider config is empty');
      return null;
    }

    // 提取 API Key - 支持多种格式
    let apiKey = '';
    if (providerConfig.apiKey) {
      if (typeof providerConfig.apiKey === 'object') {
        apiKey = (providerConfig.apiKey as any).value || (providerConfig.apiKey as any).__secret || '';
      } else {
        apiKey = providerConfig.apiKey;
      }
    }

    if (!apiKey) {
      console.log('[ClawMemory] No API key found in provider config');
      return null;
    }

    console.log('[ClawMemory] Successfully got LLM config from OpenClaw');

    return {
      baseUrl: providerConfig.baseUrl,
      apiKey: apiKey,
      model: providerConfig.models?.[0]?.id
    };
  } catch (err) {
    console.error('[ClawMemory] Failed to get LLM config:', err);
    return null;
  }
}

// 最小插件定义
const clawMemoryPlugin = {
  id: "claw-memory",
  name: "ClawMemory",
  description: "ClawMemory - Memory plugin for OpenClaw (without vector)",
  kind: "memory",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    console.log("[ClawMemory] Plugin registered successfully");

    // 获取 LLM 配置 - 使用 OpenClaw 原生方式
    const llmConfig = getLLMConfigFromOpenClaw(api);
    if (llmConfig) {
      setLLMConfig(llmConfig);
      console.log('[ClawMemory] LLM config initialized from OpenClaw');
    } else {
      console.warn('[ClawMemory] No LLM config available. Some features may not work.');
    }

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
      
      // 初始化待办事项仓库
      initTodos(db);
      console.log("[ClawMemory] Todo repository initialized");
      
      // 初始化并启动 Scheduler（在 CLI 验证模式下跳过）
      // 当环境变量 CLAW_MEMORY_SKIP_SCHEDULER=1 时不启动调度器
      // 这允许 openclaw plugins update 命令正常退出
      if (process.env.CLAW_MEMORY_SKIP_SCHEDULER === '1') {
        console.log("[ClawMemory] Skipping scheduler startup (CLAW_MEMORY_SKIP_SCHEDULER=1)");
      } else {
        const scheduler = new Scheduler(db);
        scheduler.start();
        console.log("[ClawMemory] Scheduler started");
      }
      
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
          // 使用关键词搜索
          const keywords = query.split(/\s+/).filter(k => k.length > 0);
          const keywordParams = keywords.map(k => `%${k}%`);
          const conditions = keywords.map(() => "summary LIKE ?").join(" OR ");

          const results = db.prepare(`
            SELECT m.id, m.summary, m.role, m.created_at,
                   GROUP_CONCAT(e.name) as entity_names
            FROM memories m
            LEFT JOIN memory_entities me ON m.id = me.memory_id
            LEFT JOIN entities e ON me.entity_id = e.id
            WHERE ${conditions}
            GROUP BY m.id
            ORDER BY m.created_at DESC
            LIMIT ?
          `).all(...keywordParams, limit) as any[];

          console.log(`[ClawMemory] Search found ${results.length} results`);

          if (results.length === 0) {
            return jsonResult({ text: "No memories found matching the query." });
          }

          const resultsText = results.map((r: any) => {
            const date = new Date(r.created_at).toLocaleDateString();
            const matchType = r.entity_names ? 'keyword' : 'text';
            return `[${date}] [${r.role}] [${matchType}] ${r.summary || "(无摘要)"}`;
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

    // 注册待办事项工具 - 创建待办
    api.registerTool({
      name: "clawmemory_create_todo",
      label: "ClawMemory Create Todo",
      description: "Create a new todo item",
      parameters: {
        type: "object",
        properties: {
          content: {
            type: "string",
            description: "Todo content"
          },
          period: {
            type: "string",
            enum: ["day", "week", "month"],
            description: "Todo period",
            default: "day"
          }
        },
        required: ["content"]
      },
      execute: async (_toolCallId, params) => {
        if (!db) {
          return jsonResult({ text: "Database not initialized" });
        }

        try {
          const content = params.content as string;
          const period = (params.period as string) || "day";
          const periodDate = new Date().toISOString().split("T")[0];

          const todo = createTodo({ content, period: period as any, periodDate });
          return jsonResult({ text: `Todo created: ${todo.id}\n${todo.content}` });
        } catch (error) {
          return jsonResult({ text: `Error creating todo: ${error}` });
        }
      }
    });

    // 注册待办事项工具 - 列出待办
    api.registerTool({
      name: "clawmemory_list_todos",
      label: "ClawMemory List Todos",
      description: "List todo items",
      parameters: {
        type: "object",
        properties: {
          period: {
            type: "string",
            enum: ["day", "week", "month"],
            description: "Todo period",
            default: "day"
          },
          includeCompleted: {
            type: "boolean",
            description: "Include completed todos",
            default: false
          }
        }
      },
      execute: async (_toolCallId, params) => {
        if (!db) {
          return jsonResult({ text: "Database not initialized" });
        }

        try {
          const period = (params.period as string) || "day";
          const includeCompleted = (params.includeCompleted as boolean) || false;
          const periodDate = new Date().toISOString().split("T")[0];

          const todos = listTodos(period, periodDate, includeCompleted);

          if (todos.length === 0) {
            return jsonResult({ text: "No todos found." });
          }

          const todoText = todos.map((t: any) => {
            const status = t.completedAt ? "[✓]" : "[ ]";
            return `${status} ${t.content}`;
          }).join("\n");

          return jsonResult({ text: `Todos (${period}):\n${todoText}` });
        } catch (error) {
          return jsonResult({ text: `Error listing todos: ${error}` });
        }
      }
    });

    // 注册待办事项工具 - 删除待办
    api.registerTool({
      name: "clawmemory_delete_todo",
      label: "ClawMemory Delete Todo",
      description: "Delete a todo item",
      parameters: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Todo ID"
          }
        },
        required: ["id"]
      },
      execute: async (_toolCallId, params) => {
        if (!db) {
          return jsonResult({ text: "Database not initialized" });
        }

        try {
          const id = params.id as string;
          const success = deleteTodo(id);

          if (success) {
            return jsonResult({ text: "Todo deleted successfully." });
          } else {
            return jsonResult({ text: "Todo not found." });
          }
        } catch (error) {
          return jsonResult({ text: `Error deleting todo: ${error}` });
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

        // 1. 生成内容文件路径并保存完整内容
        const memoryId = crypto.randomUUID();
        const contentPath = generateContentPath(pluginConfig.dataDir, memoryId, content);
        writeContentToFile(contentPath, content);
        
        // 2. 智能截断摘要并计算 token
        const summary = smartTruncate(content, MEMORY_CONFIG.SUMMARY_MAX_LENGTH);
        const userTokenCount = estimateTokenCount(content);
        
        // 3. 保存记忆到数据库
        db.prepare(`
          INSERT INTO memories (id, content_path, summary, role, token_count, created_at)
          VALUES (?, ?, ?, 'user', ?, datetime('now'))
        `).run(memoryId, contentPath, summary, userTokenCount);

        console.log("[ClawMemory] Memory saved:", memoryId, "to:", contentPath);

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

          console.log("[ClawMemory] Entities saved (no embedding)");
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

        // 构建工具使用说明
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
          const role = msg.role || msg.type || 'unknown';
          if (role !== 'assistant' && role !== 'ai') continue;

          let content = '';
          if (typeof msg.content === 'string') {
            content = msg.content;
          } else if (Array.isArray(msg.content)) {
            content = msg.content
              .filter((c: any) => c.type === 'text')
              .map((c: any) => c.text)
              .join('');
          } else if (typeof msg.content === 'object' && msg.content !== null) {
            content = msg.content.text || msg.content.content || JSON.stringify(msg.content);
          }

          if (!content || content.length < 10) continue;

          const contentHash = simpleHash(content.substring(0, 500));

          const existing = db.prepare(`
            SELECT id FROM memories WHERE content_hash = ?
          `).get(contentHash) as any;

          if (existing) {
            console.log(`[ClawMemory] Skipping duplicate AI response`);
            continue;
          }

          // 调用 LLM 提取元数据
          let integratedSummary: any = null;
          try {
            const metadata = await metadataExtractor.extract(content, undefined);
            integratedSummary = {
              active_areas: metadata.subjects || [],
              key_topics: metadata.keywords || [],
              recent_summary: content.substring(0, 20000),
            };
          } catch (err) {
            console.error("[ClawMemory] Error extracting metadata:", err);
          }

          // 1. 生成内容文件路径并保存完整内容
          const memoryId = crypto.randomUUID();
          const contentPath = generateContentPath(pluginConfig.dataDir, memoryId, content);
          writeContentToFile(contentPath, content);
          
          // 2. 智能截断摘要并计算 token
          const summary = smartTruncate(content, MEMORY_CONFIG.SUMMARY_MAX_LENGTH);
          const aiTokenCount = estimateTokenCount(content);
          
          // 3. 保存记忆到数据库
          db.prepare(`
            INSERT INTO memories (id, content_path, summary, role, token_count, content_hash, integrated_summary, created_at)
            VALUES (?, ?, ?, 'assistant', ?, ?, ?, datetime('now'))
          `).run(
            memoryId,
            contentPath,
            summary,
            aiTokenCount,
            contentHash,
            integratedSummary ? JSON.stringify(integratedSummary) : null
          );

          console.log(`[ClawMemory] Saved AI response to:`, contentPath);

          // 保存实体关联并创建实体关系
          try {
            const metadata = await metadataExtractor.extract(content, undefined);
            const savedEntityIds: string[] = [];

            // 保存标签
            for (const tagName of metadata.tags) {
              let entity = entityRepo.findByName(tagName);
              if (!entity) {
                entity = entityRepo.create({ name: tagName, type: "tag", level: 1 });
              }
              savedEntityIds.push(entity.id);
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
              savedEntityIds.push(entity.id);
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
              savedEntityIds.push(entity.id);
              db.prepare(`
                INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, relevance, source)
                VALUES (?, ?, ?, 'auto')
              `).run(memoryId, entity.id, 0.9);
            }

            console.log(`[ClawMemory] Saved ${savedEntityIds.length} entity associations`);

            // 创建实体间的共现关系
            if (savedEntityIds.length >= 2) {
              const entityGraphService = new EntityGraphService(db);
              for (let i = 0; i < savedEntityIds.length; i++) {
                for (let j = i + 1; j < savedEntityIds.length; j++) {
                  try {
                    // 检查关系是否已存在
                    const existingRelation = db.prepare(`
                      SELECT id, evidence_count FROM entity_relations
                      WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)
                    `).get(savedEntityIds[i], savedEntityIds[j], savedEntityIds[j], savedEntityIds[i]) as any;

                    if (existingRelation) {
                      // 增加证据计数
                      db.prepare(`
                        UPDATE entity_relations SET evidence_count = evidence_count + 1 WHERE id = ?
                      `).run(existingRelation.id);
                    } else {
                      // 创建新的共现关系
                      entityGraphService.createRelation(
                        savedEntityIds[i],
                        savedEntityIds[j],
                        'co_occur',
                        1.0
                      );
                    }
                  } catch (relationErr) {
                    console.error('[ClawMemory] Error creating relation:', relationErr);
                  }
                }
              }
              console.log(`[ClawMemory] Created entity relations for co-occurring entities`);
            }
          } catch (entityErr) {
            console.error('[ClawMemory] Error saving entities:', entityErr);
          }
        }
      } catch (error) {
        console.error("[ClawMemory] Error in agent_end:", error);
      }
    });

    console.log("[ClawMemory] All hooks registered");
  },
};

export default clawMemoryPlugin;
