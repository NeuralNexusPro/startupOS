# 需求规格 - Story OS.13

**Story:** 统一 Agent 记忆使用路径并移除 Dream 主路径
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 OriginOS 用户，我希望单 Agent 与多 Agent 在长会话中都能稳定使用记忆，不因为上下文压缩、Recall 注入或 Dream 整理而丢失最近执行轨迹、陷入重复 tool loop，且长期记忆与运行时轨迹边界清晰、行为可预期。

---

## 背景与问题

当前 Agent 记忆路径存在职责重叠和上下文污染问题，已经开始影响长会话稳定性：

1. **运行时短期轨迹与 Recall 检索混用**
   - 多 Agent `agent-worker.mts` 在历史超过阈值时，会裁剪消息历史，并把 Recall 结果注入 system prompt。
   - Recall 条目只保存摘要，无法完整表达最近 tool 调用、失败原因、纠偏指令，容易导致 Agent 忘记"刚刚已经做过什么"。

2. **Dream 与 memory 机制重叠**
   - `MemoryTracker.flushMemory()` 会把 turn 摘要刷入 `Memory.md`
   - `Dream` 也会基于 recent history + `Memory.md` 直接编辑 `Memory.md`
   - 两条路径都在把 history 变成长期记忆，但没有明确边界。

3. **Memory.md、Recall、Recent Trace 职责不清**
   - `Memory.md` 既承载长期稳定认知，又混入 turn 摘要/临时计划
   - Recall 既被当作历史检索层，又被提升到 system 层使用
   - 最近执行轨迹没有被视为独立的一等上下文层

4. **loop 风险被压缩放大**
   - 最近失败原因或禁止重复动作的约束可能在压缩时被裁掉
   - Recall 注入到 system prompt 后，旧计划/旧任务目标会以高优先级长期残留

因此需要从 OS 运行时层明确 Agent 的默认记忆使用路径，并把长期记忆整理职责统一收敛到 memory-core。

---

## 目标架构

Agent 记忆使用路径重构为三层：

### 1. 热记忆（默认进上下文）

- Agent 身份、工具规则、项目基础上下文
- `Memory.md` 的核心稳定记忆块
- `Knowledge.md` / `Patterns.md` 的精简快照
- 最近若干轮消息历史
- 最近完整执行轨迹（tool call / tool result / 失败原因 / supervisor 纠偏）

### 2. 温记忆（可自动补充，但不进 system prompt）

- 当前任务摘要
- 与当前 query 高相关的少量 Recall 结果
- 当前会话内局部相关的归档 pattern / reflection

### 3. 冷记忆（通过 memory 工具主动检索）

- 更早轮次 history
- archival / pattern / reflection 长尾内容
- 低频业务背景知识

---

## 范围

### A. 从 OS 运行时移除 Dream 主路径（必须）

- [x] Agent 启动、turn_end、周期维护主路径中，不再由 `Dream` 独立维护 `Memory.md`
- [x] `Dream` 不再作为 OS 层默认长期记忆整理机制
- [x] 长期记忆整理职责移交给 Epic M / Story M.11 的 memory-core consolidation pipeline

### B. 定义默认上下文装载规则（必须）

- [x] 明确哪些内容进入 system prompt：身份、工具、长期稳定记忆、知识/模式快照
- [x] 明确哪些内容进入 messages：最近短期对话与完整执行轨迹
- [x] 明确 Recall 不再直接写入 system prompt
- [x] 长期记忆与短期执行轨迹必须分层装载

### C. 调整压缩策略，保护 Recent Trace（必须）

- [x] 压缩时优先保留最近完整执行轨迹
- [x] 不允许用 Recall 摘要替代最近失败/纠偏信息
- [x] 近期 tool 调用、tool 结果、失败原因、禁止重复约束必须在压缩后仍可见

### D. 多 Agent 与单 Agent 记忆路径统一（必须）

- [x] 多 Agent 子进程使用与单 Agent 一致的记忆分层规则
- [x] Supervisor / Worker 的近期执行轨迹保留策略一致
- [x] 协作场景下 Recall 只作为普通补充上下文，不得进入 system 层

### E. loop 稳定性治理（建议）

- [x] 接入或增强 loop detector，识别重复 tool call / 无进展循环
- [x] 当检测到 loop 风险时，优先追加"当前失败原因 + 禁止重复动作"的工作摘要，而不是扩大 Recall 注入

### F. 不在范围

- ❌ 不在本 Story 内完成新的向量模型/embedding 能力设计
- ❌ 不在本 Story 内重做 Knowledge / Pattern 本体结构
- ❌ 不在本 Story 内实现完整 memory-core 大版本迁移（由 Epic M 承担）

---

## 设计约束

1. **Recent Trace 一等公民**
   - 最近执行轨迹优先级高于 Recall / long-term memory
   - 压缩策略必须保 Recent Trace，不得只保普通对话文本

2. **Recall 不是 system prompt**
   - Recall 只作为检索结果或普通补充上下文
   - 不再持续写入 system prompt，避免旧计划固化

3. **长期记忆只保稳定认知**
   - `Memory.md` 不再堆 turn 级流水摘要
   - 仅保留偏好、长期约束、稳定事实、已验证工作原则

4. **统一走 memory-core**
   - OS 层不再维护平行长期记忆机制
   - history -> cognition 的统一生产由 Epic M 支撑

---

## 验收标准

1. - [x] OS 层主路径不再依赖 `Dream` 做长期记忆维护
2. - [x] `Recall` 不再被直接注入 system prompt
3. - [x] 压缩后仍保留最近完整执行轨迹与最近失败/纠偏信息
4. - [x] `Memory.md` 不再追加 turn 级流水摘要，只保留长期稳定认知
5. - [x] 单 Agent 与多 Agent 使用一致的默认记忆分层规则
6. - [x] 存在长会话回归验证：压缩后重复 tool loop 明显下降
7. - [x] 与 Epic M / Story M.11 的接口边界文档化：OS 只消费 memory-core，不单独整理长期记忆

---

## 依赖关系

- **前置依赖：** OS.7（Agent 托管服务）已交付、Epic M / Story M.11 提供 memory-core 支撑能力
- **优先级：** High（直接影响 Agent loop 稳定性、长会话质量与多 Agent 协作行为）
- **估计工时:** 4-6 天

---

## 相关文档

- [Story OS.7 — Agent 托管服务](../story-OS.7/README.md)
- [Epic M / Story M.11 — memory-core consolidation](../../epic-M/story-M.11/README.md)
- [Epic R — RoleAgent](../../epic-R/)
- [Epic 9 — 多 Agent 协作](../../epic-9/)
