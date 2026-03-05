/**
 * ClawMemory 工具函数
 */

import * as fs from 'fs';
import * as path from 'path';
import { MEMORY_CONFIG } from '../constants.js';

/**
 * 智能截断文本 - 在句子边界截断
 */
export function smartTruncate(text: string, maxLength: number = MEMORY_CONFIG.SUMMARY_MAX_LENGTH): string {
  if (!text || text.length <= maxLength) {
    return text;
  }

  const endPunctuations = MEMORY_CONFIG.SUMMARY_TRUNCATE.END_PUNCTUATIONS;
  
  // 在 maxLength 位置附近查找最近的句子结束符
  const searchStart = Math.max(0, maxLength - 100);
  const searchEnd = Math.min(text.length, maxLength + 50);
  
  let bestPosition = maxLength;
  
  for (let i = searchStart; i < searchEnd; i++) {
    const char = text[i];
    if (endPunctuations.includes(char as typeof endPunctuations[number])) {
      // 找到句子结束符，记录位置（+1 包含结束符）
      bestPosition = i + 1;
      // 如果找到中文句号，说明是完整句子，可以提前结束
      if (['。', '！', '？'].includes(char)) {
        break;
      }
    }
  }
  
  return text.substring(0, bestPosition);
}

/**
 * 生成唯一的内容文件路径
 */
export function generateContentPath(dataDir: string, memoryId: string, content: string): string {
  const contentDir = path.join(dataDir, MEMORY_CONFIG.CONTENT_DIR);
  
  // 确保目录存在
  if (!fs.existsSync(contentDir)) {
    fs.mkdirSync(contentDir, { recursive: true });
  }
  
  // 使用 memoryId 作为文件名
  const ext = detectExtension(content);
  const fileName = `${memoryId}${ext}`;
  const filePath = path.join(contentDir, fileName);
  
  return filePath;
}

/**
 * 根据内容类型检测文件扩展名
 */
function detectExtension(content: string): string {
  // 如果包含 HTML 标签
  if (/<[a-z][\s\S]*>/i.test(content)) {
    return '.html';
  }
  // 如果是 JSON
  if (content.trim().startsWith('{') && content.trim().endsWith('}')) {
    return '.json';
  }
  // 如果是 Markdown
  if (content.includes('#') || content.includes('```')) {
    return '.md';
  }
  // 默认纯文本
  return '.txt';
}

/**
 * 将内容写入文件
 */
export function writeContentToFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * 从文件读取内容
 */
export function readContentFromFile(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath)) {
      return fs.readFileSync(filePath, 'utf-8');
    }
    return null;
  } catch (error) {
    console.error(`[ClawMemory] Failed to read content from file: ${filePath}`, error);
    return null;
  }
}

/**
 * 估算 token 数量
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / MEMORY_CONFIG.TOKEN_ESTIMATE_RATIO);
}

/**
 * 简单哈希函数
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * 格式化日期
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString().split('T')[0];
}

/**
 * 格式化时间戳
 */
export function formatTimestamp(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toISOString();
}

/**
 * 获取时间范围开始日期
 */
export function getStartDate(period: 'day' | 'week' | 'month'): Date {
  const today = new Date();
  switch (period) {
    case 'day':
      return today;
    case 'week':
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      return weekStart;
    case 'month':
      return new Date(today.getFullYear(), today.getMonth(), 1);
    default:
      return today;
  }
}

/**
 * 检查内容是否重复
 */
export function isDuplicate(content: string, existingHashes: string[]): boolean {
  const hash = simpleHash(content.substring(0, 500));
  return existingHashes.includes(hash);
}

/**
 * 清理过期内容文件
 */
export function cleanupContentFiles(dataDir: string, validIds: Set<string>): number {
  const contentDir = path.join(dataDir, MEMORY_CONFIG.CONTENT_DIR);
  let cleanedCount = 0;
  
  if (!fs.existsSync(contentDir)) {
    return cleanedCount;
  }
  
  const files = fs.readdirSync(contentDir);
  for (const file of files) {
    const fileId = path.basename(file, path.extname(file));
    if (!validIds.has(fileId)) {
      try {
        fs.unlinkSync(path.join(contentDir, file));
        cleanedCount++;
      } catch (error) {
        console.error(`[ClawMemory] Failed to delete content file: ${file}`, error);
      }
    }
  }
  
  return cleanedCount;
}

/**
 * 防抖函数
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * 节流函数
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;
  
  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 随机 ID 生成
 */
export function generateId(): string {
  return crypto.randomUUID();
}
