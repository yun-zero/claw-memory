import { getDatabase } from './db/schema.js';
import { getConfig, PluginConfig } from './config/plugin.js';
import { handleMessageSent } from './hooks/message.js';
import { handleAgentBootstrap } from './hooks/bootstrap.js';
import { registerMemoryTools } from './tools/memory.js';
import { Scheduler } from './services/scheduler.js';
import type { InternalHookHandler } from './types.js';

export interface OpenClawPluginContext {
  registerHook: (events: string | string[], handler: InternalHookHandler) => void;
  registerTool: (tool: any) => void;
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
    version: '0.1.4',

    async register(api: OpenClawPluginContext) {
      if (!pluginConfig.enabled) {
        console.log('[ClawMemory] Plugin disabled');
        return;
      }

      console.log('[ClawMemory] Starting...');

      // 初始化数据库
      const db = getDatabase(pluginConfig.dataDir + '/memory.db');

      // 注册 message:sent hook
      api.registerHook('message:sent', async (event: any) => {
        if (pluginConfig.autoSave) {
          try {
            await handleMessageSent(event, db, pluginConfig.dataDir);
          } catch (error) {
            console.error('[ClawMemory] Failed to save memory:', error);
          }
        }
      });

      // 注册 agent:bootstrap hook
      api.registerHook('agent:bootstrap', async (event: any) => {
        try {
          const summary = await handleAgentBootstrap(db);
          if (summary) {
            event.context = event.context || '';
            event.context += '\n\n' + summary;
          }
        } catch (error) {
          console.error('[ClawMemory] Failed to inject summary:', error);
        }
      });

      // 注册 Agent Tools
      registerMemoryTools({ register: api.registerTool }, db, pluginConfig.dataDir);

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
