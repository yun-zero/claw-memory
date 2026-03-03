import type { Database } from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { homedir } from 'os';

interface MessageEvent {
  message: {
    role: 'user' | 'assistant';
    content: string;
  };
  session: {
    id: string;
    key: string;
  };
  conversation?: Array<{
    role: 'user' | 'assistant';
    content: string;
  }>;
}

export async function handleMessageSent(
  event: MessageEvent,
  db: Database,
  dataDir: string
): Promise<void> {
  // 只处理 assistant 消息（AI 回复后保存）
  if (event.message.role !== 'assistant') {
    return;
  }

  // 从 conversation 中获取最后一条 user 消息
  let userMessage = '';
  if (event.conversation && event.conversation.length > 0) {
    // 找到最后一个 user 消息
    for (let i = event.conversation.length - 1; i >= 0; i--) {
      if (event.conversation[i].role === 'user') {
        userMessage = event.conversation[i].content;
        break;
      }
    }
  }

  const assistantMessage = event.message.content;

  if (!userMessage || !assistantMessage) {
    console.log('[ClawMemory] Skipping - no valid Q&A pair');
    return;
  }

  // 构建 Q&A
  const qaContent = `Q: ${userMessage}\n\nA: ${assistantMessage}`;

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

  // 提取摘要（取前200字符）
  const summary = assistantMessage.substring(0, 200);

  // 插入数据库
  db.prepare(`
    INSERT INTO memories (id, content_path, summary, created_at)
    VALUES (?, ?, ?, datetime('now'))
  `).run(memoryId, contentPath, summary);

  console.log(`[ClawMemory] Saved memory: ${memoryId}`);
}
