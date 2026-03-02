# Claw-Memory 测试方案设计

> 创建日期: 2026-03-02
> 状态: 待批准

## 1. 测试目标

- **范围**: 核心业务逻辑 (memory service, retrieval service)
- **策略**: 基础测试 + 边界测试 + 异常处理
- **覆盖率**: 80%+

## 2. 测试结构

```
tests/
├── services/
│   ├── memory.test.ts       # 扩展: 边界 + 异常
│   └── retrieval.test.ts    # 扩展: 边界 + 异常
└── db/
    └── repository.test.ts   # 扩展: 边界测试
```

## 3. 测试用例设计

### 3.1 MemoryService

#### saveMemory 边界测试

| 测试项 | 输入 | 预期 |
|-------|------|------|
| 正常保存 | 完整 metadata | 成功返回 memory 对象 |
| 空 content | content: "" | 允许空内容 |
| 无 metadata | 无 metadata 字段 | 使用默认值 |
| 缺失 tags | metadata: {} | tags 为空数组 |
| 自定义 importance | importance: 1.0 | 正确保存 |
| 超长 content | 10000+ 字符 | 正确处理 |

#### searchMemory 边界测试

| 测试项 | 输入 | 预期 |
|-------|------|------|
| 空 query | query: "" | 返回所有记忆 |
| 空结果 | query: "不存在" | 返回空数组 |
| limit=0 | limit: 0 | 返回空数组 |
| limit=1 | limit: 1 | 返回 1 条 |
| 超大 limit | limit: 10000 | 正确限制 |

#### getContext 边界测试

| 测试项 | 输入 | 预期 |
|-------|------|------|
| 空结果 | 无记忆 | 返回空字符串 |
| maxTokens=0 | maxTokens: 0 | 返回空 |
| 超大 maxTokens | maxTokens: 100000 | 正确处理 |
| 单条记忆超限 | 单条 > maxTokens | 截断 |

### 3.2 RetrievalService

#### calculateWeight 边界测试

| 测试项 | 输入 | 预期 |
|-------|------|------|
| 今天 | memoryDate: 今天 | 最高权重 |
| 1周前 | memoryDate: 7天前 | 中等权重 |
| 1年前 | memoryDate: 365天前 | 较低权重 |
| 重要性=0 | importance: 0 | 权重 0 |
| 重要性=1 | importance: 1 | 权重 10 |
| entityMatch=0 | entityMatch: 0 | 权重 0 |
| entityMatch=10 | entityMatch: 10 | 权重 40 (上限) |

### 3.3 异常处理测试

| 场景 | 预期行为 |
|-----|---------|
| 数据库连接失败 | 抛出明确错误 |
| 文件写入失败 | 返回错误信息 |
| 非法 JSON | 错误处理 |

## 4. 覆盖率目标

| 模块 | 当前测试数 | 目标测试数 |
|-----|----------|----------|
| memory.ts | 3 | 15+ |
| retrieval.ts | 2 | 10+ |
| repository.ts | 5 | 8+ |

## 5. 执行计划

1. 扩展 memory.test.ts - 添加 12 个边界测试
2. 扩展 retrieval.test.ts - 添加 8 个边界测试
3. 扩展 repository.test.ts - 添加 3 个边界测试
4. 添加异常场景测试
5. 运行测试确保 80%+ 覆盖率
