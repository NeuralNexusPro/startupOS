# 架构文档 - Story M.7

**Story:** Pattern 质量提升 + Memory 集成
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 技术文件

```
src/modules/memory-core/archival/pattern-ingest.ts  # Pattern 语义化提取 + Archival 写入
src/lib/integrations/pi-agent/cognitive/pattern-provider.ts  # 修改：增强统计 + prefetch/searchReflections 走 Archival
```

---

## 数据结构变更

### 当前 PatternStats

```typescript
interface PatternStats {
  count: number;
  resolved: number;
  totalLength: number;
  lastScene: string;
  bestThinking: string;
}
```

### 增强后 EnhancedPatternStats

```typescript
interface EnhancedPatternStats {
  count: number;
  resolved: number;
  totalLength: number;

  // 场景上下文（完整）
  scene: string;           // 用户消息完整前 200 字符
  bestThinking: string;    // 最长 thinking（用于提炼原则）

  // 工具调用细节（新增）
  toolResults: Array<{
    name: string;
    successRate: number;       // 该工具的成功率
    avgResultSummary: string;  // 成功时的典型返回摘要
    commonErrors: string[];    // 常见错误信息
  }>;

  // 执行效果（新增）
  avgExecutionQuality: number; // 0-1，基于成功率和用户纠正
  userCorrections: number;     // 用户纠正次数
  outcomeSummary: string;      // 最终是否解决问题
}
```

---

## 模块设计

### Pattern 语义化存储

Pattern 条目写入 Archival Memory：

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

prefetch 改为语义搜索：

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

### Reflection 语义化存储

反思条目写入 Archival Memory：

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

searchReflections 改为语义搜索：

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

### 一次性迁移

Agent 启动时将现有 Pattern 数据批量导入 Archival：

```
patterns/registry.json → 每个 PatternEntry → archival.insert()
patterns/episodic-memory/*.json → 每个 ReflectionEntry → archival.insert()
```
