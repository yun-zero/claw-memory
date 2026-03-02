import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';

export interface Todo {
  id: string;
  content: string;
  period: 'day' | 'week' | 'month';
  periodDate: string;
  createdAt: Date;
  completedAt: Date | null;
  memoryId: string | null;
}

export interface CreateTodoInput {
  content: string;
  period: 'day' | 'week' | 'month';
  periodDate: string;
  memoryId?: string;
}

export class TodoRepository {
  constructor(private db: Database.Database) {}

  create(input: CreateTodoInput): Todo {
    const id = uuidv4();
    const createdAt = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO todos (id, content, period, period_date, created_at, memory_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.content, input.period, input.periodDate, createdAt, input.memoryId || null);

    return {
      id,
      content: input.content,
      period: input.period,
      periodDate: input.periodDate,
      createdAt: new Date(createdAt),
      completedAt: null,
      memoryId: input.memoryId || null
    };
  }

  findByPeriod(period: string, periodDate: string): Todo[] {
    const rows = this.db.prepare(`
      SELECT * FROM todos WHERE period = ? AND period_date = ?
      ORDER BY created_at DESC
    `).all(period, periodDate) as any[];

    return rows.map(row => ({
      id: row.id,
      content: row.content,
      period: row.period,
      periodDate: row.period_date,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      memoryId: row.memory_id
    }));
  }

  findById(id: string): Todo | null {
    const row = this.db.prepare('SELECT * FROM todos WHERE id = ?').get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      content: row.content,
      period: row.period,
      periodDate: row.period_date,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      memoryId: row.memory_id
    };
  }

  markCompleted(id: string): void {
    this.db.prepare(`
      UPDATE todos SET completed_at = ? WHERE id = ?
    `).run(new Date().toISOString(), id);
  }
}
