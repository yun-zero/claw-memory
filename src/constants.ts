/**
 * ClawMemory 常量配置
 */

// 记忆存储配置
export const MEMORY_CONFIG = {
  // 内容存储
  CONTENT_DIR: 'memories/contents',
  
  // 摘要截断配置
  SUMMARY_MAX_LENGTH: 500,        // 摘要最大字符数
  CONTENT_PREVIEW_LENGTH: 20000,  // 内容预览最大字符数（用于摘要字段）
  
  // Token 估算（中文约 1.5 字符/token，英文约 4 字符/token）
  TOKEN_ESTIMATE_RATIO: 2,
  
  // 摘要截断配置
  SUMMARY_TRUNCATE: {
    MAX_LENGTH: 500,
    MIN_LENGTH: 100,
    END_PUNCTUATIONS: ['。', '！', '？', '.', '!', '?', '；', ';', '\n'],
  },
  
  // 实体相关性权重
  ENTITY_RELEVANCE: {
    TAG: 1.0,
    SUBJECT: 0.9,
    KEYWORD: 0.8,
  },
  
  // 实体类型
  ENTITY_TYPES: {
    TAG: 'tag',
    KEYWORD: 'keyword',
    SUBJECT: 'subject',
    PERSON: 'person',
    PROJECT: 'project',
  },
  
  // 关系类型
  RELATION_TYPES: {
    CO_OCCUR: 'co_occur',
    RELATED: 'related',
    PARENT: 'parent',
    SIMILAR: 'similar',
  },
  
  // 时间桶配置
  TIME_BUCKET: {
    DEFAULT_PERIOD: 'week',
    SUMMARIZE_INTERVAL: 24 * 60 * 60 * 1000, // 24小时（毫秒）
  },
  
  // 待办事项配置
  TODO_CONFIG: {
    DEFAULT_PERIOD: 'day',
    PERIODS: ['day', 'week', 'month', 'once'],
  },
  
  // 缓存配置
  CACHE_CONFIG: {
    MAX_SIZE: 1000,
    TTL: 5 * 60 * 1000, // 5分钟
  },
  
  // 数据库配置
  DB_CONFIG: {
    WAL_MODE: true,
    CACHE_SIZE: 2000, // 2MB
  },
  
  // Scheduler 配置
  SCHEDULER_CONFIG: {
    // 清理过期记忆（30天前）
    CLEANUP_EXPIRED_CRON: '0 2 * * *', // 每天凌晨2点
    // 自动摘要整合（每天凌晨3点）
    SUMMARIZE_CRON: '0 3 * * *',
    // 实体关系构建（每周日凌晨4点）
    BUILD_RELATIONS_CRON: '0 4 * * 0',
  },
  
  // 默认配置
  DEFAULT_MAX_CONTEXT_MEMORIES: 3,
  DEFAULT_AUTO_SAVE: true,
  DEFAULT_ENABLED: true,
} as const;

// 消息过滤配置
export const MESSAGE_FILTER = {
  MIN_LENGTH: 5,
  IGNORE_PREFIXES: ['System:', 'Conversation info'],
} as const;

// 搜索配置
export const SEARCH_CONFIG = {
  DEFAULT_LIMIT: 10,
  MAX_LIMIT: 100,
} as const;

// 时间范围配置
export const TIME_RANGE = {
  TODAY: 'today',
  WEEK: 'week',
  MONTH: 'month',
  YEAR: 'year',
  ALL: 'all',
} as const;
