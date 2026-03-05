/**
 * ClawMemory 错误处理工具
 */

// 基础错误类
export class MemoryError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode: number = 500
  ) {
    super(message);
    this.name = 'MemoryError';
    Error.captureStackTrace(this, this.constructor);
  }
}

// 资源未找到错误
export class NotFoundError extends MemoryError {
  constructor(resource: string, id?: string) {
    const message = id 
      ? `${resource} with id '${id}' not found` 
      : `${resource} not found`;
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

// 验证错误
export class ValidationError extends MemoryError {
  constructor(message: string, public field?: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

// 数据库错误
export class DatabaseError extends MemoryError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'DATABASE_ERROR', 500);
    this.name = 'DatabaseError';
  }
}

// 配置错误
export class ConfigError extends MemoryError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', 500);
    this.name = 'ConfigError';
  }
}

// LLM 错误
export class LLMError extends MemoryError {
  constructor(message: string, public originalError?: Error) {
    super(message, 'LLM_ERROR', 500);
    this.name = 'LLMError';
  }
}

// 重复错误
export class DuplicateError extends MemoryError {
  constructor(resource: string) {
    super(`${resource} already exists`, 'DUPLICATE', 409);
    this.name = 'DuplicateError';
  }
}

// 工具函数：安全执行并捕获错误
export async function safeExecute<T>(
  fn: () => Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<[T | null, Error | null]> {
  try {
    const result = await fn();
    return [result, null];
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[ClawMemory] ${errorMessage}:`, err.message);
    return [null, err];
  }
}

// 工具函数：安全执行同步函数并捕获错误
export function safeExecuteSync<T>(
  fn: () => T,
  errorMessage: string = 'Operation failed'
): [T | null, Error | null] {
  try {
    const result = fn();
    return [result, null];
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error(`[ClawMemory] ${errorMessage}:`, err.message);
    return [null, err];
  }
}

// 错误日志记录
export function logError(context: string, error: Error): void {
  console.error(`[ClawMemory] Error in ${context}:`, {
    name: error.name,
    message: error.message,
    stack: error.stack,
  });
}
