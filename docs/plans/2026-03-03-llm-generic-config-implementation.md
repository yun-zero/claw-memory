# LLM配置通用化实现计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将LLM配置从固定供应商改为通用格式，支持任意OpenAI兼容API

**Architecture:** 通过format字段区分请求格式，baseUrl灵活配置API端点，实现最大兼容性

**Tech Stack:** TypeScript, 环境变量配置

---

### Task 1: 修改LLMConfig接口

**Files:**
- Modify: `src/config/llm.ts:1-115`

**Step 1: 修改接口定义**

```typescript
export interface LLMConfig {
  format: 'openai' | 'anthropic' | 'openai-compatible';
  baseUrl: string;
  apiKey: string;
  model: string;
}
```

**Step 2: 更新getLLMConfig函数**

```typescript
export function getLLMConfig(): LLMConfig {
  const format = (process.env.LLM_FORMAT as LLMConfig['format']) || 'openai';
  const baseUrl = process.env.LLM_BASE_URL || getDefaultBaseUrl(format);
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || '';
  const model = process.env.LLM_MODEL || getDefaultModel(format);

  if (!apiKey) {
    throw new Error('No LLM API key configured. Set LLM_API_KEY environment variable.');
  }

  return { format, baseUrl, apiKey, model };
}

function getDefaultBaseUrl(format: LLMConfig['format']): string {
  switch (format) {
    case 'anthropic':
      return 'https://api.anthropic.com';
    case 'openai':
    case 'openai-compatible':
    default:
      return 'https://api.openai.com/v1';
  }
}

function getDefaultModel(format: LLMConfig['format']): string {
  switch (format) {
    case 'anthropic':
      return 'claude-3-haiku-20240307';
    case 'openai':
    case 'openai-compatible':
    default:
      return 'gpt-4o-mini';
  }
}
```

**Step 3: 提交代码**

```bash
git add src/config/llm.ts
git commit -m "refactor: update LLMConfig to generic format"
```

---

### Task 2: 添加OpenAI兼容API支持

**Files:**
- Modify: `src/config/llm.ts`

**Step 1: 添加generateWithOpenAICompatible函数**

```typescript
async function generateWithOpenAICompatible(
  systemPrompt: string,
  userPrompt: string,
  config: LLMConfig
): Promise<string> {
  const response = await fetch(`${config.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 1024,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Compatible API error: ${error}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content || '总结生成失败';
}
```

**Step 2: 更新generateSummaryWithLLM路由逻辑**

修改 `generateSummaryWithLLM` 函数：

```typescript
export async function generateSummaryWithLLM(
  report: string,
  config?: LLMConfig
): Promise<string> {
  const llmConfig = config || getLLMConfig();

  const systemPrompt = `你是一个智能助手...`; // 现有prompt

  if (llmConfig.format === 'anthropic') {
    return generateWithAnthropic(systemPrompt, report, llmConfig);
  } else if (llmConfig.format === 'openai-compatible') {
    return generateWithOpenAICompatible(systemPrompt, report, llmConfig);
  } else {
    return generateWithOpenAI(systemPrompt, report, llmConfig);
  }
}
```

**Step 3: 提交代码**

```bash
git add src/config/llm.ts
git commit -m "feat: add OpenAI compatible API support"
```

---

### Task 3: 验证与测试

**Files:**
- Test: `src/config/llm.ts`

**Step 1: 验证配置解析**

```bash
# 临时设置环境变量测试
LLM_FORMAT=openai-compatible \
LLM_BASE_URL=https://api.minimax.chat/v1 \
LLM_API_KEY=test-key \
LLM_MODEL=abab6.5s-chat \
node -e "import('./src/config/llm.js').then(m => console.log(m.getLLMConfig()))"
```

**Step 2: 运行现有测试**

```bash
npm test
```

**Step 3: 提交**

```bash
git commit -m "test: verify LLM config works"
```

---

## 执行选项

**Plan complete and saved to `docs/plans/2026-03-03-llm-generic-config-design.md`. Two execution options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach?**
