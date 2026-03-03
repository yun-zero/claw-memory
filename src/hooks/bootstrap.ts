import type { Database } from 'better-sqlite3';

export async function handleAgentBootstrap(
  db: Database
): Promise<string> {
  // 获取本周记忆摘要
  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay());
  const weekStartStr = weekStart.toISOString().split('T')[0];

  const weekMemories = db.prepare(`
    SELECT summary, importance
    FROM memories
    WHERE created_at >= ?
    ORDER BY importance DESC
    LIMIT 10
  `).all(weekStartStr) as { summary: string; importance: number }[];

  if (weekMemories.length === 0) {
    return '';
  }

  // 构建摘要文本
  const lines = ['## 记忆摘要\n'];
  lines.push(`本周共有 ${weekMemories.length} 条记忆记录。\n`);
  lines.push('### 重点内容:\n');

  for (const m of weekMemories.slice(0, 5)) {
    if (m.summary) {
      lines.push(`- ${m.summary}`);
    }
  }

  return lines.join('\n');
}
