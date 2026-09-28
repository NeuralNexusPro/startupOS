# 需求文档 - Story C.10

**Story:** Pattern 机制重构 — 基于 Memory Core 的上层应用
**Epic:** C（认知系统）
**最后更新:** 2026-05-27

---

## 用户故事

> 作为 Agent，我需要能够区分"用户认可的最佳实践（Positive）"和"用户指出问题的反例（Negative）"，并把这两类经验存到统一的语义记忆中，下次遇到类似场景时能被准确召回。

---

## 背景

Pattern 当前有三处缺陷阻止其生效（详见设计文档 §1）：

1. 协作运行时（`agent-worker.mts`）**没有注册 PracticeLogger** → `practice/turns/` 为空 → 旧 `PatternProvider.on_session_end` 没有源数据。
2. **正负信号缺失**：`outcome.userCorrections` 字段定义了但从未被填充；当前 positive / negative 仅靠统计阈值，与用户语义反馈完全脱钩。
3. **存储双写未收敛**：旧 `registry.json` + `episodic-memory/` 与新 `archival/` 并存，新数据继续双写，`Patterns.md` 仍由旧路径渲染。

设计原则：**Pattern 是上层应用，由 Memory Core 提供底层记忆能力**。本 Story 将 pattern 业务逻辑（信号提取 / 分类 / 渲染）与 archival 存储能力分离。

---

## 范围

### In scope

1. 新建 `cognitive/pattern/` 模块，拆分为：
   - `correction-detector.ts` — 用户纠正信号识别（中文 + 英文规则）
   - `extractor.ts` — Positive / Negative 分类与文本组装
   - `renderer.ts` — 从 archival 重建 Patterns.md
   - `index.ts` — 统一 `PatternProvider`（实现 `CognitiveProvider`）
2. 协作运行时补注册 `PracticeLogger`。
3. Turn 收集处填充 `outcome.userCorrections` 与 `correctionSignals`。
4. 一次性迁移旧 `registry.json` / `episodic-memory/` 到 archival。
5. 删除旧 `pattern-provider.ts` 与 `enhanced-pattern-provider.ts`，统一出口。

### Out of scope（明确不做）

- LLM 驱动的纠正分类（留 v2）
- Pattern 评分跨 session 衰减
- Pattern 自动阻断工具调用

---

## 依赖

- ✅ Story C.4（实践日志记录系统）—— `PracticeLogger` 已存在，仅需接线
- ✅ Story C.5（经验模式提取引擎）—— 旧 PatternProvider 是本 Story 的重构对象
- ✅ Story C.8（Reflexion 失败反思）—— Reflection 仍保留，迁入 archival
- ✅ Story M.3（Archival Memory 语义存储）—— 底层能力
- ✅ Story M.6（MemoryProvider 集成 + 适配器）—— Archival 已可注入
- 🔁 Story M.7（Pattern 质量提升）—— 与本 Story 紧耦合，M.7 关注信号提取细节，C.10 关注分层 + Positive/Negative 二分；建议合并实施或先后紧邻

---

## 风险

| 风险 | 缓解 |
|------|------|
| CorrectionDetector 规则误判 | v1 只用强信号写 `userCorrections`，弱信号仅记 `correctionSignals` 不计数 |
| 协作运行时改动影响进程隔离 | 仅在 worker 内增加 provider 注册，无跨进程契约变更 |
| Archival 写入量上升 | Positive 仅在 toolChain 非空且 resolved 时写；空对话不入库 |

---

## 关联文档

- 设计：`docs/design/pattern-on-memory-core.md`
- 前置：`docs/specs/epic-M/story-M.7/README.md`
- Epic C 总览：`docs/specs/epic-C/README.md`
