# 需求文档 - Story M.11

**Story:** 用 Memory Core 统一 history-to-cognition 管线并替代 Dream
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 OriginOS 的维护者，我需要让 `memory-core` 成为唯一的 history-to-cognition 中枢，把对话历史统一沉淀为 Recall、长期稳定记忆、Pattern/Reflection 等认知产物，从而替代现有 Dream 机制，并避免 `Memory.md`、Recall、turn 摘要互相污染。

---

## 背景与问题

当前 `history -> cognition` 路径分散在多套机制中：

1. `MemoryTracker` 把 turn 级摘要刷入 `Memory.md`
2. `Dream` 基于 recent history + `Memory.md` 再次编辑 `Memory.md`
3. `RecallMemory` 保存可检索历史，但没有清晰规定何时升级为长期认知
4. `PatternProvider` / `EnhancedPatternProvider` 已能从 turn 数据提炼 pattern / reflection，但与 `Memory.md` 无统一边界

这导致：

- `Memory.md` 同时像日志、摘要、长期记忆、block 容器
- Dream 与 flush 在同一文件上重叠写入
- Recall 与长期记忆边界模糊
- loop 噪声和临时计划容易被固化成长期记忆

因此需要把所有长期认知生成统一收拢到 `memory-core`。

---

## 目标模型

memory-core 输出四类产物：

1. **Recall History**
   - 逐轮历史
   - 仅供检索
   - 不直接进入 system prompt

2. **Long-term Stable Memory**
   - 用户偏好
   - 项目长期约束
   - 稳定事实
   - 已验证工作原则
   - 落点：`Memory.md` 核心块

3. **Pattern / Reflection**
   - 成功模式
   - 失败反思
   - 反模式
   - 落点：archival / pattern registry

4. **Knowledge Candidates**
   - 可上升为 wiki / ontology 的结构化知识候选
   - 由 knowledge provider 消费

---

## 设计原则

1. **history 不等于 memory**
   - history 是原始轮次记录
   - memory 是经过筛选后的长期稳定认知

2. **长期记忆单写者**
   - `Memory.md` 只能由 memory-core consolidation 写入
   - 避免 Dream / flush / runtime 多方改写

3. **先分类，再沉淀**
   - 不是所有历史都值得成为认知
   - 先判断类别和稳定性，再决定写入目标

4. **认知产物分层存储**
   - stable memory ≠ pattern ≠ recall ≠ knowledge
   - 不能再混写同一份文件

---

## 与其他 Story 的关系

- **M.8 / M.9 / M.10**：先完成记忆链路收敛、语义检索、文档对齐
- **OS.13**：OS 层消费本 Story 输出的统一 memory pipeline
- **Epic R**：RoleAgent 的 MemoryTracker / Dream 需要迁移到新模型
- **Epic C**：Knowledge / Pattern provider 与本 Story 的分类结果对接
