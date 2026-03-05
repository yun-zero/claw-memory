/**
 * 待办事项 Hooks
 * 提供待办事项的 CRUD 功能
 */

import Database from 'better-sqlite3';
import { TodoRepository, CreateTodoInput } from '../db/todoRepository.js';

let todoRepo: TodoRepository | null = null;

/**
 * 初始化待办事项仓库
 */
export function initTodos(db: Database.Database): void {
  todoRepo = new TodoRepository(db);
}

/**
 * 创建待办事项
 */
export function createTodo(input: CreateTodoInput): any {
  if (!todoRepo) {
    throw new Error('Todo repository not initialized');
  }
  return todoRepo.create(input);
}

/**
 * 获取待办事项列表
 */
export function listTodos(period?: string, periodDate?: string, includeCompleted = false): any[] {
  if (!todoRepo) {
    throw new Error('Todo repository not initialized');
  }
  
  // 默认获取今天的待办
  const p = period || 'day';
  const pd = periodDate || new Date().toISOString().split('T')[0];
  
  return todoRepo.findByPeriod(p, pd, includeCompleted);
}

/**
 * 切换待办事项完成状态
 */
export function toggleTodo(id: string): boolean {
  if (!todoRepo) {
    throw new Error('Todo repository not initialized');
  }
  
  const todo = todoRepo.findById(id);
  if (!todo) {
    return false;
  }
  
  if (todo.completedAt) {
    // 取消完成 - 不支持，标记为已完成
    return false;
  } else {
    todoRepo.markCompleted(id);
    return true;
  }
}

/**
 * 删除待办事项
 */
export function deleteTodo(id: string): boolean {
  if (!todoRepo) {
    throw new Error('Todo repository not initialized');
  }
  
  const todo = todoRepo.findById(id);
  if (!todo) {
    return false;
  }
  
  const db = (todoRepo as any).db as Database.Database;
  db.prepare('DELETE FROM todos WHERE id = ?').run(id);
  return true;
}

/**
 * 获取今天的待办事项
 */
export function getTodayTodos(): any[] {
  return listTodos('day', new Date().toISOString().split('T')[0]);
}

/**
 * 获取本周的待办事项
 */
export function getWeekTodos(): any[] {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const weekStart = new Date(today.getFullYear(), today.getMonth(), diff);
  const weekStartStr = weekStart.toISOString().split('T')[0];
  
  return listTodos('week', weekStartStr);
}
