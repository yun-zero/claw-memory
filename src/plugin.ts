import { getDatabase } from './db/schema.js';
import { getConfig, PluginConfig } from './config/plugin.js';
import { handleMessageSent } from './hooks/message.js';
import { handleAgentBootstrap } from './hooks/bootstrap.js';
import { registerMemoryTools } from './tools/memory.js';
import { Scheduler } from './services/scheduler.js';

export interface OpenClawPluginContext {
  hooks: {
    register: (event: string, handler: any) => Promise<void>;
  };
  tools: {
    register: (tool: any) => void;
  };
  config?: any;
}

export interface OpenClawPlugin {
  name: string;
  version: string;
  register: (context: OpenClawPluginContext) => Promise<void>;
}

export function createPlugin(config?: any): OpenClawPlugin {
  const pluginConfig = getConfig(config);

  return {
    name: 'claw-memory',
    version: '0.1.0',

    async register(context: OpenClawPluginContext) {
      if (!pluginConfig.enabled) {
        console.log('[ClawMemory] Plugin disabled');
        return;
      }

      console.log('[ClawMemory] Starting...');

      // 初始化数据库
      const db = getDatabase(pluginConfig.dataDir + '/memory.db');

      // 注册 message:sent hook
      await context.hooks.register('message:sent', async (event: any) => {
        if (pluginConfig.autoSave) {
          try {
            await handleMessageSent(event, db, pluginConfig.dataDir);
          } catch (error) {
            console.error('[ClawMemory] Failed to save memory:', error);
          }
        }
      });

      // 注册 agent:bootstrap hook
      await context.hooks.register('agent:bootstrap', async (bootstrapContext: any) => {
        try {
          const summary = await handleAgentBootstrap(db);
          if (summary) {
            bootstrapContext.context = bootstrapContext.context || '';
            bootstrapContext.context += '\n\n' + summary;
          }
        } catch (error) {
          console.error('[ClawMemory] Failed to inject summary:', error);
        }
      });

      // 注册 Agent Tools
      registerMemoryTools(context.tools, db, pluginConfig.dataDir);

      // 启动 Scheduler
      if (pluginConfig.scheduler.enabled) {
        try {
          const scheduler = new Scheduler(db, pluginConfig.scheduler);
          scheduler.start();
        } catch (error) {
          console.error('[ClawMemory] Failed to start scheduler:', error);
        }
      }

      console.log('[ClawMemory] Started successfully');
    }
  };
}

// 默认导出用于 OpenClaw 加载
export default createPlugin();
