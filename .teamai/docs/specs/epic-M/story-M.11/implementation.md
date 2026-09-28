# 实施文档 - Story M.11

**Story:** 用 Memory Core 统一 history-to-cognition 管线并替代 Dream
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## Phase 1: 建立 consolidation 入口

- [x] 在 `memory-core` 中新增统一的 history-to-cognition consolidation 入口
- [x] 输入统一采用 turn/history 数据，而不是直接读 `Memory.md`
- [x] 输出至少支持：stable memory、pattern/reflection、knowledge candidate 三类结果

---

## Phase 2: 停止旧路径直写 `Memory.md`

- [x] 将 `MemoryTracker.flushMemory()` 从"追加摘要到 `Memory.md`"改为"只维护 history/recall store"
- [x] 将长期记忆写入收敛到 memory-core consolidation
- [x] 在迁移期间保留旧格式读取兼容，但不再继续扩张旧格式内容

---

## Phase 3: 替代 Dream

- [x] 将 Dream 当前承担的 `[ADD]/[UPDATE]/[REMOVE]` 长期记忆整理职责迁入 memory-core
- [x] 若保留 Dream 代码，则仅作为内部转换器或迁移脚手架，不再作为独立机制暴露
- [x] 清理文档和 prompt 架构中对 Dream 的默认依赖描述

---

## Phase 4: 统一消费接口

- [x] 向 OS / Agent runtime 暴露统一查询接口：
  - `recent_history`
  - `stable_memory`
  - `pattern`
  - `reflection`
  - `knowledge_candidate`
- [x] 约定默认装载和按需检索边界，避免 OS 层重复实现
- [x] 为所有启动方式定义统一消费 contract，至少覆盖：
  - `project`
  - `agent`
  - `skill`
  - `role-agent`
  - `persistent project agent`
  - `multi-agent`

---

## Phase 5: 迁移与验证

- [x] 用已有 RoleAgent / ProjectAgent / 多 Agent 历史样本做迁移回归
- [x] 验证临时计划、loop 噪声不会再进入 `Memory.md`
- [x] 验证用户偏好、长期约束、稳定事实仍能被正确沉淀
