/**
 * 缓存层服务
 * 提供内存缓存以提升查询性能
 */

import { MEMORY_CONFIG } from '../constants.js';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * 缓存类
 */
export class MemoryCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private ttl: number;

  constructor(maxSize: number = MEMORY_CONFIG.CACHE_CONFIG.MAX_SIZE, ttl: number = MEMORY_CONFIG.CACHE_CONFIG.TTL) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl;
  }

  /**
   * 设置缓存
   */
  set(key: string, value: T): void {
    // 如果缓存已满，删除最旧的条目
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttl
    });
  }

  /**
   * 获取缓存
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    // 将访问的条目移到末尾（LRU）
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * 删除缓存
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 检查缓存是否存在
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * 获取缓存大小
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 清理过期条目
   */
  cleanup(): number {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

// 全局缓存实例
let searchCache: MemoryCache<any> | null = null;
let indexCache: MemoryCache<any> | null = null;

/**
 * 获取搜索缓存实例
 */
export function getSearchCache(): MemoryCache<any> {
  if (!searchCache) {
    searchCache = new MemoryCache(100, 30000); // 100条，30秒
  }
  return searchCache;
}

/**
 * 获取索引缓存实例
 */
export function getIndexCache(): MemoryCache<any> {
  if (!indexCache) {
    indexCache = new MemoryCache(10, 60000); // 10条，60秒
  }
  return indexCache;
}

/**
 * 清除所有缓存
 */
export function clearAllCaches(): void {
  if (searchCache) {
    searchCache.clear();
  }
  if (indexCache) {
    indexCache.clear();
  }
  console.log('[ClawMemory] All caches cleared');
}
