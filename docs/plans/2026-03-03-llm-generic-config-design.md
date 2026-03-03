# LLM配置通用化设计

## 概述

将LLM配置从固定供应商改为通用格式，支持任意OpenAI兼容API。

## 配置结构

```typescript
export interface LLMConfig {
  format: 'openai' | 'anthropic' | 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
}
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| LLM_FORMAT | 格式类型 | openai |
| LLM_BASE_URL | API基础URL | https://api.openai.com/v1 |
| LLM_API_KEY | API密钥 | - |
| LLM_MODEL | 模型名称 | gpt-4o-mini |

## 请求格式

- `openai`: OpenAI官方API `/v1/chat/completions`
- `anthropic`: Anthropic API `/v1/messages`
- `openai-compatible`: 兼容格式，使用OpenAI格式调用其他API

## 实现步骤

1. 修改 `LLMConfig` 接口
2. 更新 `getLLMConfig()` 读取新环境变量
3. 添加 `generateWithOpenAICompatible()` 函数
4. 更新 `generateSummaryWithLLM()` 路由逻辑
5. 测试验证

## 向后兼容

现有使用 `OPENAI_API_KEY` 或 `ANTHROPIC_API_KEY` 的代码需要迁移到新格式。
