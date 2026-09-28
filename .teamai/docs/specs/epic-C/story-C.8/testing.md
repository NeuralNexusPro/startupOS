# 测试策略 - Story C.8

**Story:** Reflexion 失败反思
**Epic:** C（认知系统）
**最后更新:** 2026-07-17

---

## 测试策略

Reflexion 失败反思功能的测试覆盖从失败检测、反思生成、存储、检索注入、记忆衰退到去重的完整生命周期。重点验证：

1. 失败检测触发的准确性（三种失败标准）
2. 反思生成与存储的正确性
3. 检索注入与现有 PatternProvider 功能的兼容性
4. 记忆衰退（TTL）和去重机制的边界条件

---

## 功能测试用例

以下用例对应验收标准，全部通过视为功能验收合格。

| 编号 | 用例 | 预期结果 |
|------|------|---------|
| F-01 | `sync_turn()` 检测到 `outcome.resolved === false` 时 | 调用 `on_failure()` 生成反思 |
| F-02 | `sync_turn()` 检测到工具调用 `result === "error"` 时 | 调用 `on_failure()` 生成反思 |
| F-03 | `sync_turn()` 检测到 `userCorrections > 0` 时 | 调用 `on_failure()` 生成反思 |
| F-04 | 反思生成后检查存储路径 | 以 JSON 格式存储在 `patterns/episodic-memory/` 目录 |
| F-05 | 反思 JSON 结构验证 | 包含 id、turnId、timestamp、scene、toolChain、failureReason、reflection（含三字段）、tags、ttl、usedCount |
| F-06 | `prefetch(query)` 在有相关反思时 | 返回模式 + 反思的组合结果 |
| F-07 | `prefetch(query)` 检索排序 | 优先返回近期且 `usedCount` 低的反思 |
| F-08 | 反思被注入到 `system_prompt_block()` 输出中 | 输出包含 episodic memory 中最近/相关的反思片段 |
| F-09 | TTL 过期反思处理 | 过期后移入 `archived/` 子目录，不立即删除 |
| F-10 | 反思被检索时 `usedCount` 更新 | `usedCount++`，TTL 延长 7 天 |
| F-11 | 新反思去重 — 标签 Jaccard 相似度 > 80% | 追加到已有反思的 `alternativeAttempts` 数组，不创建新文件 |
| F-12 | 新反思去重 — 标签 Jaccard 相似度 ≤ 80% | 创建新反思文件 |
| F-13 | `episodic-memory/` 下文件数 ≤ 100 时 | 不触发压缩 |
| F-14 | `episodic-memory/` 下文件数 > 100 时 | 自动触发压缩：合并同类反思（tags 交集 > 50%）、删除未使用过期反思、生成 `compaction-report.md` |

---

## 兼容性测试用例

确保新增功能不破坏现有 PatternProvider 行为。

| 编号 | 用例 | 预期结果 |
|------|------|---------|
| C-01 | PatternProvider 现有功能回归 | registry.json 读写不受影响 |
| C-02 | Patterns.md 生成 | 保持不变，新反思功能不影响现有模式渲染 |
| C-03 | `episodic-memory/` 目录与现有 `patterns/` 文件共存 | 无冲突 |
| C-04 | `on_failure` 异步执行 | 不阻塞 Agent 主 turn 流程 |

---

## 测试文件规划

| 测试文件 | 覆盖范围 |
|---------|---------|
| `pattern-provider.reflection.test.ts` | F-01 ~ F-05：失败检测、反思生成、存储结构 |
| `pattern-provider.recall.test.ts` | F-06 ~ F-08：检索注入、排序逻辑 |
| `pattern-provider.rot.test.ts` | F-09 ~ F-14：TTL 衰退、压缩、去重 |
| `pattern-provider.compat.test.ts` | C-01 ~ C-04：现有功能兼容性 |
