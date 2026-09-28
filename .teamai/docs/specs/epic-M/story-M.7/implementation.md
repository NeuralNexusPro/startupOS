# 实施文档 - Story M.7

**Story:** Pattern 质量提升 + Memory 集成
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 1. 增强 Pattern 提取（含完整工具调用信息）

### 新 extractPrinciple 实现

```typescript
// 新 extractPrinciple：从完整工具调用链 + 场景 + thinking 中提炼
function extractPrinciple(
  tools: string[],
  stats: EnhancedPatternStats,
  isAntiPattern: boolean
): string {
  if (isAntiPattern) {
    return generateAntiPatternPrinciple(tools, stats);
  }

  // 1. 从 toolResults 提取成功路径
  const successPath = tools.map(t => {
    const result = stats.toolResults.find(r => r.name === t);
    if (!result) return t;
    return result.successRate >= 0.8 ? `${t}(高效)` : `${t}(不稳定)`;
  }).join(' → ');

  // 2. 从 bestThinking 提取决策逻辑
  const reasoning = extractReasoningFromThinking(stats.bestThinking);

  // 3. 合并为有意义的 principle
  return `场景: ${stats.scene}。推荐路径: ${successPath}。` +
         `${reasoning ? '决策逻辑: ' + reasoning : ''}` +
         `成功率: ${stats.resolved / stats.count * 100}%（${stats.count}次）`;
}
```

---

## 2. Tool 调用结果收集

### 在 `on_session_end` 中收集完整工具调用信息

```typescript
for (const turn of recentTurns) {
  const turnData: TurnCognitiveData = JSON.parse(readFileSync(turnPath, 'utf-8'));
  const chainKey = turnData.toolCalls.map(t => t.name).join(' → ');

  // 统计每个工具的执行效果
  for (const tc of turnData.toolCalls) {
    const toolStats = toolStatsMap.get(tc.name) ?? {
      successCount: 0,
      totalCount: 0,
      resultSummaries: [] as string[],
      errors: [] as string[],
    };

    toolStats.totalCount++;
    if (tc.success) {
      toolStats.successCount++;
      // 提取返回摘要（前 100 字符）
      toolStats.resultSummaries.push(tc.result.slice(0, 100));
    } else {
      toolStats.errors.push(tc.result?.slice(0, 100) || 'unknown error');
    }

    toolStatsMap.set(tc.name, toolStats);
  }
}
```

---

## 3. Pattern 语义化存储

### 将 Pattern 条目写入 Archival Memory

```typescript
// pattern-provider.ts: sync_turn 中
await archival.insert(
  JSON.stringify({
    pattern: patternEntry,
    toolChainSummary: patternEntry.toolChain.join(' → '),
    principle: patternEntry.principle || patternEntry.triggerCondition,
    effectiveness: patternEntry.effectiveness,
  }),
  ['pattern', ...patternEntry.toolChain]
);
```

### prefetch 改为语义搜索

```typescript
async prefetch(query: string): Promise<string | null> {
  // 优先走 Archival 语义搜索
  const archivalResults = await this.archival.search(query, {
    limit: 5,
    tags: ['pattern'],
    minScore: 0.2,
  });

  if (archivalResults.length > 0) {
    // 回退到现有关键词匹配
    const keywordResults = this.keywordFallback(query);
    return this.mergeResults(archivalResults, keywordResults);
  }

  return this.keywordFallback(query);
}
```

---

## 4. Reflection 语义化

### 将反思条目写入 Archival Memory

```typescript
// on_failure 中
await archival.insert(
  JSON.stringify({
    scene: data.userMessage,
    failureReason: errors,
    toolChain: data.toolCalls.map(t => t.name),
    lesson: `失败路径: ${toolChain.join(' → ')} 在当前场景下不可靠`,
  }),
  ['reflection', ...data.toolCalls.map(t => t.name)]
);
```

### searchReflections 改为语义搜索

```typescript
async searchReflections(query: string): Promise<string | null> {
  const archivalResults = await this.archival.search(query, {
    limit: 3,
    tags: ['reflection'],
    minScore: 0.2,
  });

  if (archivalResults.length > 0) return this.formatReflections(archivalResults);

  // 回退到现有 Jaccard 标签匹配
  return this.jaccardFallback(query);
}
```

---

## 5. 一次性迁移

Agent 启动时将现有 Pattern 数据批量导入 Archival：

```
patterns/registry.json → 每个 PatternEntry → archival.insert()
patterns/episodic-memory/*.json → 每个 ReflectionEntry → archival.insert()
```
