# 架构文档 - Story M.11

**Story:** 用 Memory Core 统一 history-to-cognition 管线并替代 Dream
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 范围

### A. 用 memory-core 接管长期记忆整理（必须）

- [x] 新增或扩展 consolidation pipeline，由 `memory-core` 统一处理 history -> long-term stable memory
- [x] 用 memory-core 替代 `Dream` 对 `Memory.md` 的主路径维护职责
- [x] `Memory.md` 的唯一写入入口迁移到 memory-core consolidation

### B. 停止向 `Memory.md` 追加 turn 流水摘要（必须）

- [x] `MemoryTracker.flushMemory()` 不再把逐轮摘要批量追加进 `Memory.md`
- [x] turn 原始历史只留在 Recall / history store
- [x] `Memory.md` 只保留长期稳定认知块

### C. 建立 history-to-cognition 分类规则（必须）

- [x] 明确哪些 history 信号进入长期稳定记忆
- [x] 明确哪些进入 pattern / reflection
- [x] 明确哪些只保留在 recall，不得升级到长期记忆
- [x] 至少覆盖：用户偏好、长期约束、事实、计划、临时失败、工具使用经验

### D. 提供统一检索接口（建议）

- [x] 统一 recall / archival / pattern 的查询接口与返回格式
- [x] 支持按用途返回：`stable_memory` / `recent_history` / `pattern` / `reflection`

### E. 与 OS 层约定消费方式（必须）

- [x] 向 OS / Agent runtime 明确哪些内容默认装载到上下文
- [x] 哪些只能通过工具或按需 recall 获取
- [x] 明确禁止 OS 层直接再做独立长期记忆整理

---

## 关键文件

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| MODIFY | `packages/core/src/modules/memory-core/` | 新增/扩展 consolidation 与分类能力 |
| MODIFY | `packages/core/src/modules/memory-core/session/memory-provider.ts` | 暴露统一 history-to-cognition 与消费接口 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/role-agent/memory-tracker.ts` | 停止 turn 摘要直写 `Memory.md` |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/role-agent/dream.ts` | Dream 退出主路径或删除 |
| MODIFY | `packages/core/src/lib/features/services/launcher/` | 各启动链路对 memory-core 的统一接入 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/persistent-agent-manager.ts` | persistent project agent 的 memory-core 集成 |
| MODIFY | `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts` | multi-agent worker 的 memory-core 集成 |
| MODIFY | `docs/design/memory-core.md` | 记录 history-to-cognition 目标模型 |

---

## 实施清单

### Phase 1: 建立 consolidation 入口

- [x] 在 `memory-core` 中新增统一的 history-to-cognition consolidation 入口
- [x] 输入统一采用 turn/history 数据，而不是直接读 `Memory.md`
- [x] 输出至少支持：stable memory、pattern/reflection、knowledge candidate 三类结果

### Phase 2: 停止旧路径直写 `Memory.md`

- [x] 将 `MemoryTracker.flushMemory()` 从"追加摘要到 `Memory.md`"改为"只维护 history/recall store"
- [x] 将长期记忆写入收敛到 memory-core consolidation
- [x] 在迁移期间保留旧格式读取兼容，但不再继续扩张旧格式内容

### Phase 3: 替代 Dream

- [x] 将 Dream 当前承担的 `[ADD]/[UPDATE]/[REMOVE]` 长期记忆整理职责迁入 memory-core
- [x] 若保留 Dream 代码，则仅作为内部转换器或迁移脚手架，不再作为独立机制暴露
- [x] 清理文档和 prompt 架构中对 Dream 的默认依赖描述

### Phase 4: 统一消费接口

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

### Phase 5: 迁移与验证

- [x] 用已有 RoleAgent / ProjectAgent / 多 Agent 历史样本做迁移回归
- [x] 验证临时计划、loop 噪声不会再进入 `Memory.md`
- [x] 验证用户偏好、长期约束、稳定事实仍能被正确沉淀
