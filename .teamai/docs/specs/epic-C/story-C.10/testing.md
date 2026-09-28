# 测试策略 - Story C.10

**Story:** Pattern 机制重构 — 基于 Memory Core 的上层应用
**Epic:** C（认知系统）
**最后更新:** 2026-05-27

---

## 测试策略

Pattern 机制重构的测试覆盖三条 Agent 执行链路（in-process / persistent / collaboration sandbox）上的 Positive/Negative 经验二分全流程。重点验证：

1. PracticeLogger 在协作运行时的正确注册与 turn 数据收集
2. CorrectionDetector 中英文纠正信号的识别准确性
3. Positive/Negative 分类与 archival ingest 的 tags 正确性
4. Patterns.md 从 archival 重建的完整性
5. 旧数据一次性迁移的正确性
6. 三条执行链路的兼容性

---

## 功能验收用例

| 编号 | 用例 | 预期结果 |
|------|------|---------|
| F-01 | 协作运行时 session 跑完后 | `data/projects/{pid}/agents/{name}/practice/turns/` 出现 turn JSON |
| F-02 | 用户消息含明确纠正（如「不对」「重新来」「应该是 X」）时 — userCorrections | turn JSON 中 `outcome.userCorrections >= 1` |
| F-03 | 用户消息含明确纠正时 — correctionSignals | `outcome.correctionSignals[]` 非空 |
| F-04 | 上述 turn 的 archival ingest | 被 ingest 为 `[NEGATIVE]` 的 archival entry，且 tags 包含 `pattern`、`negative`、`correction-strong\|medium` |
| F-05 | 已解决且无纠正的 turn | 被 ingest 为 `[POSITIVE]` archival entry |
| F-06 | `on_session_end` 完成后 | `Patterns.md` 包含 `## Positive` 与 `## Negative` 两个区，内容与 archival 一致 |
| F-07 | `prefetch(query)` 排序 | 优先返回 positive，并展示 score |
| F-08 | 旧数据迁移 | 旧 `registry.json` / `episodic-memory/` 数据在首次启动时被一次性迁移到 archival |

---

## 兼容性验收用例

| 编号 | 用例 | 预期结果 |
|------|------|---------|
| C-01 | in-process agent 链路 | 正常工作 |
| C-02 | persistent agent 链路 | 正常工作 |
| C-03 | collaboration sandbox 链路 | 正常工作 |
| C-04 | `legacy` 模式开关 | 存在，可回滚到旧 PatternProvider（保留一个版本周期后删除） |

---

## 单元测试用例

| 编号 | 测试文件 | 覆盖范围 |
|------|---------|---------|
| T-01 | `correction-detector.test.ts` | 中英文 12+ 正负样本 |
| T-02 | `extractor.test.ts` | 三种 outcome（resolved / unresolved / corrected）分类正确 |
| T-03 | `renderer.test.ts` | 空 / 仅 positive / 仅 negative / 混合 四种渲染状态 |
