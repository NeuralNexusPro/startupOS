# 架构设计 - Story C.10

**Story:** Pattern 机制重构 — 基于 Memory Core 的上层应用
**Epic:** C（认知系统）
**最后更新:** 2026-05-27

---

## 核心改动点

| 文件 | 改动 |
|------|------|
| `src/lib/integrations/pi-agent/cognitive/pattern/` | **新建** 模块（见设计文档 §3） |
| `src/lib/integrations/pi-agent/cognitive/pattern-provider.ts` | **删除**（迁移完成后） |
| `src/modules/memory-core/session/enhanced-pattern-provider.ts` | **删除**，合并入新 `pattern/extractor.ts` |
| `src/modules/collaboration-runtime/sandbox/agent-worker.mts` | 注册 `PracticeLogger`；改用新 `PatternProvider` |
| `src/lib/integrations/pi-agent/persistent-agent-manager.ts` | 移除新旧两个 PatternProvider 并存的注册，统一用新版 |
| `src/lib/integrations/pi-agent/persistent-agent.ts` | turn 收集处接入 `CorrectionDetector`，填 `outcome.userCorrections` 与 `correctionSignals` |
| `src/lib/integrations/pi-agent/agent-manager.ts` | 同上（in-process agent 路径） |
| `src/lib/integrations/pi-agent/cognitive/types.ts` | 扩展 `TurnCognitiveData.outcome.correctionSignals?: CorrectionSignal[]` |

---

## 关键数据契约

```typescript
// cognitive/pattern/types.ts
export interface CorrectionSignal {
  strength: 'strong' | 'medium' | 'weak';
  matched: string;        // 命中的关键词
  excerpt: string;        // 用户消息片段
}

export type PatternPolarity = 'positive' | 'negative';

export interface PatternIngestPayload {
  polarity: PatternPolarity;
  scene: string;
  toolChain: string[];
  resultSummary?: string;
  failureReason?: string;
  userFeedback?: string;
  correctionStrength?: CorrectionSignal['strength'];
}
```

Archival 写入 tags：

- 必带：`pattern`, `positive` | `negative`
- 工具名：`...toolChain`
- 场景标签：`extractSceneTags(scene)`（≤ 5）
- 纠正强度（negative 专属）：`correction-strong` / `correction-medium`

---

## 落地切片

参见设计文档 §7。建议顺序：

1. PracticeLogger 接线（协作运行时）
2. CorrectionDetector + types 扩展
3. 新 PatternProvider（ingest 走 archival）
4. Renderer（重建 Patterns.md）
5. 清理旧 provider
