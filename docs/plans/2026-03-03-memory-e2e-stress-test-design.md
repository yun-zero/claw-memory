# Memory E2E & Stress Test Design

**Date:** 2026-03-03
**Status:** Draft

## Overview

Design for testing claw-memory component through simulated OpenClaw usage, including end-to-end functional tests and stress tests with large-scale knowledge domain conversations.

## Goals

1. **End-to-End Test (A)**: Verify complete workflow with real conversation logs
2. **Stress Test (B)**: Test batch writing with different knowledge domains and evaluate retrieval accuracy

---

## Part A: End-to-End Test

### Test Flow

```
Real conversation logs → Parser → MemoryService → MCP Tools → Verify
                              ↓
                        Database Storage
                              ↓
                        Retrieve/Summary → Compare with expected
```

### Test Steps

1. **Data Preparation**: Read real conversation samples from `test/fixtures/`
2. **Save Memory**: Call `save_memory` for each conversation
3. **Search Verification**: Call `search_memory` with different queries, verify relevance
4. **Context Verification**: Call `get_context`, verify context contains relevant memories
5. **Summary Verification**: Call `get_summary`, verify summary accuracy and completeness

### Test Data

- Source: Real conversation logs from project test directory
- Format: JSON with conversation messages, metadata

---

## Part B: Stress Test

### 1. Batch Writing Optimization

**Problem**: LLM API calls for each memory are expensive

**Solution**: Batch multiple memories into single LLM call

```typescript
// Before: N LLM calls
for (const msg of messages) {
  await llm.extractMetadata(msg);
}

// After: 1 LLM call per batch (50-100 messages)
const batchResult = await llm.extractMetadataBatch(messages);
```

**Expected Reduction**: 1000 memories → ~10-20 API calls instead of 1000

### 2. Knowledge Domains

Write conversations from diverse domains:

- **Technology/Programming**: React, Python, Database, APIs
- **Product/Design**: UI/UX, Requirements Analysis
- **Daily Office**: Meeting notes, Task management
- **Random Mixed**: Various domains

### 3. Retrieval Accuracy Metrics

| Metric | Description |
|--------|-------------|
| **Recall@K** | Ratio of relevant memories retrieved in top K |
| **Precision@K** | Ratio of retrieved results that are relevant |
| **MRR** | Mean Reciprocal Rank of first relevant result |
| **NDCG@K** | Normalized Discounted Cumulative Gain considering ranking position |

### 4. Test Queries

| Query | Expected Domain |
|-------|-----------------|
| "React 组件开发" | React-related memories |
| "数据库优化" | Database-related memories |
| "项目进度" | Task/progress-related memories |

### 5. Test Method

```
Write 1000 memories from different domains
       ↓
For each test query:
  - Execute search_memory
  - Mark results as relevant/irrelevant (using ground truth)
  - Calculate Recall@K, Precision@K, MRR, NDCG@K
       ↓
Output evaluation report
```

---

## Acceptance Criteria

1. E2E test covers full flow: save → search → context → summary
2. Stress test writes 1000+ memories with batch LLM calls
3. Retrieval accuracy metrics calculated and reported
4. Test results reproducible and automated
