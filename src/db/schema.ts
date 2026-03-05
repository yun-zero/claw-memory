import { execSync } from 'child_process';
import path from 'path';
import type Database from 'better-sqlite3';

// better-sqlite3 模块加载器
let _Database: typeof Database;

function loadDatabase(): typeof Database {
  if (_Database) return _Database;

  // 尝试加载并验证 better-sqlite3
  const tryLoadAndVerify = (): typeof Database => {
    const mod = require('better-sqlite3');
    // 尝试创建内存数据库来验证原生模块是否可用
    try {
      new mod(':memory:').close();
      return mod;
    } catch (e: any) {
      throw new Error('Native module not available: ' + e.message);
    }
  };

  try {
    _Database = tryLoadAndVerify();
    return _Database;
  } catch (e: any) {
    console.log('[ClawMemory] better-sqlite3 native module not available, attempting to build...');
    try {
      // 尝试使用 prebuild-install 下载预编译版本
      const moduleDir = path.dirname(require.resolve('better-sqlite3/package.json'));
      execSync('npx prebuild-install', { cwd: moduleDir, stdio: 'inherit' });
      _Database = tryLoadAndVerify();
      console.log('[ClawMemory] better-sqlite3 built successfully via prebuild');
      return _Database;
    } catch (buildError: any) {
      console.log('[ClawMemory] prebuild failed, attempting full build...');
      try {
        const moduleDir = path.dirname(require.resolve('better-sqlite3/package.json'));
        execSync('npm run install', { cwd: moduleDir, stdio: 'inherit' });
        _Database = tryLoadAndVerify();
        console.log('[ClawMemory] better-sqlite3 built successfully');
        return _Database;
      } catch (fullBuildError: any) {
        console.error('[ClawMemory] Failed to build better-sqlite3:', fullBuildError.message);
        throw new Error('better-sqlite3 native module not available. Please run: npm rebuild better-sqlite3');
      }
    }
  }
}

export function initializeDatabase(db: Database.Database): void {
  // 1. 记忆表
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      content_path TEXT NOT NULL,
      summary TEXT,
      integrated_summary JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      token_count INTEGER DEFAULT 0,
      importance REAL DEFAULT 0.5,
      access_count INTEGER DEFAULT 0,
      last_accessed_at TIMESTAMP,
      is_archived BOOLEAN DEFAULT FALSE,
      is_duplicate BOOLEAN DEFAULT FALSE,
      duplicate_of TEXT,
      role TEXT DEFAULT 'user',
      content_hash TEXT
    )
  `);

  // 2. 实体表
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      parent_id TEXT,
      level INTEGER DEFAULT 0,
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (parent_id) REFERENCES entities(id)
    )
  `);

  // 3. 记忆-实体关联表
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_entities (
      memory_id TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      relevance REAL DEFAULT 1.0,
      source TEXT DEFAULT 'auto',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (memory_id, entity_id),
      FOREIGN KEY (memory_id) REFERENCES memories(id),
      FOREIGN KEY (entity_id) REFERENCES entities(id)
    )
  `);

  // 4. 实体关系图
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_relations (
      id TEXT PRIMARY KEY,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      evidence_count INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_id) REFERENCES entities(id),
      FOREIGN KEY (target_id) REFERENCES entities(id),
      UNIQUE(source_id, target_id, relation_type)
    )
  `);

  // 5. 时间桶
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_buckets (
      date DATE PRIMARY KEY,
      memory_count INTEGER DEFAULT 0,
      summary TEXT,
      summary_generated_at TIMESTAMP,
      key_topics JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. 待办事项
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      period TEXT NOT NULL,
      period_date TEXT,
      created_at TEXT NOT NULL,
      completed_at TEXT,
      memory_id TEXT
    )
  `);

  // 创建索引
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_memories_created ON memories(created_at);
    CREATE INDEX IF NOT EXISTS idx_memories_importance ON memories(importance);
    CREATE INDEX IF NOT EXISTS idx_memories_role ON memories(role);
    CREATE INDEX IF NOT EXISTS idx_memories_hash ON memories(content_hash);
    CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
    CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(type);
    CREATE INDEX IF NOT EXISTS idx_entities_parent ON entities(parent_id);
    CREATE INDEX IF NOT EXISTS idx_memory_entities_entity ON memory_entities(entity_id);
    CREATE INDEX IF NOT EXISTS idx_entity_relations_source ON entity_relations(source_id);
    CREATE INDEX IF NOT EXISTS idx_entity_relations_target ON entity_relations(target_id);
  `);
}

let dbInstance: Database.Database | null = null;

export function resetDbInstance(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

export function getDatabase(dbPath: string = './memories/memory.db'): Database.Database {
  // DEBUG: getDatabase 调用日志
  console.log('[ClawMemory] getDatabase() called, path:', dbPath);

  if (!dbInstance) {
    console.log('[ClawMemory] Creating new database instance...');
    try {
      const Database = loadDatabase();
      dbInstance = new Database(dbPath);
      console.log('[ClawMemory] Database instance created, initializing...');
      
      // 启用 WAL 模式（提升并发性能）
      dbInstance.pragma('journal_mode = WAL');
      // 设置缓存大小（MB）
      dbInstance.pragma('cache_size = -2000'); // 2MB
      // 启用外键约束
      dbInstance.pragma('foreign_keys = ON');
      // 同步模式（标准）
      dbInstance.pragma('synchronous = NORMAL');
      
      initializeDatabase(dbInstance);
      console.log('[ClawMemory] Database initialized with optimizations');
    } catch (error) {
      console.error('[ClawMemory] Failed to create database:', error);
      throw error;
    }
  }
  return dbInstance;
}
