import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';
import type { InternalHookEvent } from '../types.js';

export async function handleMessageSent(
  event: InternalHookEvent,
  db: Database,
  dataDir: string
): Promise<void> {
  // 确保 context 存在
  if (!event.context || typeof event.context !== 'object') {
    return;
  }

  const ctx = event.context as Record<string, unknown>;

  // 只处理成功发送的消息
  if (ctx.success !== true) {
    return;
  }

  const assistantMessage = ctx.content as string;

  if (!assistantMessage) {
    console.log('[ClawMemory] Skipping - no message content');
    return;
  }

  // 构建 Q&A（简化版，只保存AI回复）
  const qaContent = `A: ${assistantMessage}`;

  // 解析 dataDir 中的 ~
  const resolvedDataDir = dataDir.replace(/^~/, homedir());

  // 直接创建目录（recursive: true 已处理存在的情况）
  const memoriesDir = path.join(resolvedDataDir, 'memories');
  fs.mkdirSync(memoriesDir, { recursive: true });

  // 保存记忆
  const memoryId = uuidv4();
  const contentPath = path.join(memoriesDir, `${memoryId}.md`);

  // 异步写入文件
  await fs.promises.writeFile(contentPath, qaContent, 'utf-8');

  // 提取摘要（取前20000字符）
  const summary = assistantMessage.substring(0, 20000);

  // 插入数据库
  db.prepare(`
    INSERT INTO memories (id, content_path, summary, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(memoryId, contentPath, summary);

  console.log(`[ClawMemory] Saved memory: ${memoryId}`);
}
