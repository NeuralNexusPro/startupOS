# 需求文档 - Story M.7

**Story:** Pattern 质量提升 + Memory 集成
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 Agent，我需要从实践日志中提取**有意义、可复用**的经验模式，而非简单的工具链名称 + 截断的 thinking 文本，这样我才能在遇到类似场景时应用这些模式提升效率。

---

## 问题分析

当前 PatternProvider 生成的模式摘要毫无意义：

```typescript
// 当前 extractPrinciple 输出
{
  name: "Auto: read_file → write_file → analyze",
  principle: '场景: "帮我分析这个文件"。决策推理: 我需要先读取文件内容...',
  effectiveness: { avgToolCalls: 3, successRate: 100, sampleCount: 1 }
}
```

### 根因分析

| 问题 | 现象 | 根因 |
|------|------|------|
| **无工具调用结果** | `extractPrinciple` 只看 tool names，不看 success/result | `pattern-provider.ts` 的 `chainStats` 只统计 `turnData.toolCalls.map(t => t.name)` |
| **thinking 截断** | `stats.bestThinking` 只保留最长 thinking 前 200 字符 | 无结构化提炼，纯字符串截取 |
| **无上下文** | 只看 `lastScene`（用户消息前 100 字符） | 缺少完整对话上下文 |
| **无模式对比** | 无法比较同一工具链在不同场景下的效果 | `chainsMatch` 要求精确名称匹配 |

### 当前数据缺失点

```typescript
// pattern-provider.ts:186-207
// 当前只统计这些：
chainStats.set(chainKey, {
  count: 0,
  resolved: 0,
  totalLength: 0,
  lastScene: '',       // 仅用户消息前 100 字符
  bestThinking: '',    // 仅最长 thinking 文本
  // 缺少：
  // - toolCall.success 统计
  // - toolCall.result 摘要
  // - toolCall.params 摘要
  // - 错误信息聚合
  // - 完整对话上下文
});
```

---

## 功能需求概览

1. **修复：增强 Pattern 提取** — 含完整工具调用信息（`EnhancedPatternStats`）
2. **Tool 调用结果利用** — 在 `on_session_end` 中收集完整工具调用信息
3. **Pattern 语义化存储** — 将 Pattern 条目写入 Archival Memory，prefetch 改为语义搜索
4. **Reflection 语义化** — 将反思条目写入 Archival Memory，searchReflections 走语义搜索
5. **一次性迁移** — Agent 启动时将现有 Pattern 数据批量导入 Archival

> 详细代码实现参见 [implementation.md](./implementation.md)
