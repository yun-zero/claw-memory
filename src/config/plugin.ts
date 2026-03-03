import os from 'os';
import path from 'path';

export interface PluginConfig {
  enabled: boolean;
  autoSave: boolean;
  saveMode: 'qa' | 'full';
  dataDir: string;
  scheduler: {
    enabled: boolean;
    deduplicateTime: string;
    dailyTime: string;
    weeklyTime: string;
    monthlyTime: string;
  };
}

function expandTilde(filepath: string): string {
  if (filepath.startsWith('~/') || filepath === '~') {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

export function getConfig(config?: any): PluginConfig {
  const defaultConfig: PluginConfig = {
    enabled: true,
    autoSave: true,
    saveMode: 'qa',
    dataDir: expandTilde('~/.openclaw/claw-memory'),
    scheduler: {
      enabled: true,
      deduplicateTime: '01:00',
      dailyTime: '02:00',
      weeklyTime: '03:00',
      monthlyTime: '04:00'
    }
  };

  if (!config) {
    return defaultConfig;
  }

  return {
    enabled: config.enabled ?? defaultConfig.enabled,
    autoSave: config.autoSave ?? defaultConfig.autoSave,
    saveMode: config.saveMode ?? defaultConfig.saveMode,
    dataDir: expandTilde(config.dataDir ?? defaultConfig.dataDir),
    scheduler: {
      enabled: config.scheduler?.enabled ?? defaultConfig.scheduler.enabled,
      deduplicateTime: config.scheduler?.deduplicateTime ?? defaultConfig.scheduler.deduplicateTime,
      dailyTime: config.scheduler?.dailyTime ?? defaultConfig.scheduler.dailyTime,
      weeklyTime: config.scheduler?.weeklyTime ?? defaultConfig.scheduler.weeklyTime,
      monthlyTime: config.scheduler?.monthlyTime ?? defaultConfig.scheduler.monthlyTime
    }
  };
}
