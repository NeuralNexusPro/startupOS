---
title: 多 Agent 协作运行时架构审查（2026-05-20）
status: 已发布
date: 2026-05-20
author: Architecture Governance
related:
  - docs/design/multi-agent-runtime.md
  - docs/design/multi-agent-prompt-architecture.md
  - docs/specs/epic-9/README.md
  - CLAUDE.md（v2.3.0）
---

# 多 Agent 协作运行时架构审查（Architecture Review）

**审查范围：** `src/modules/collaboration-runtime/`、`src/lib/collaboration-runtime-bridge/`、`src/lib/collaboration-runtime-service/`、`src/lib/integrations/pi-agent/project-agent/`、`src/app/api/collaboration/**`、Epic 9 Stories 9.1–9.26、设计文档 multi-agent-runtime.md / multi-agent-prompt-architecture.md。

**审查目标：** 基于 AGENTS.md v2.3.0 架构围栏，识别现状代码与设计文档的偏离、模块边界破损、抽象空壳化、死代码与命名混乱，并给出治理动作。

**结论摘要：** Phase 1+2 在功能层基本贯通，但**架构治理层存在 4 个 Critical、5 个 High、4 个 Medium 风险项**，已统一编号为 ARCH-RT-01 至 ARCH-RT-13。需在进入 Phase 3 高级特性（9.19–9.23）前完成 Critical 项治理，否则模块边界将进一步劣化。

---

## 1. Critical 风险项

### ARCH-RT-01 ｜ 模块围栏违规：`integrations/agent-registry.ts` 直接 import `src/lib/`

**状态：** Resolved（Story 9.27）

- **位置：** `src/modules/collaboration-runtime/integrations/agent-registry.ts`
- **现象：** 直接 `import { parseAgentDefinition, parseToolDefinition } from "@/lib/integrations/pi-agent/persistent-agent"`
- **违反条款：** AGENTS.md §禁止事项 #9 — 「collaboration-runtime 模块内部直接 import `src/lib/` 或 `src/components/`」；§模块依赖规约 — 单向按序依赖。
- **风险：** 围栏失守会让模块无法独立替换或下沉为独立 npm 包；外部模块对 PI Agent 的隐式耦合无法通过 DI 替换，破坏「模块内部不 import 外部模块，通过 DI 注入」的合规承诺（设计文档 §15.4 自我宣称的合规项实际为否）。
- **治理动作：**
  1. 将 `parseAgentDefinition / parseToolDefinition` 抽到 `CollaborationRuntimeDeps` 接口（`src/modules/collaboration-runtime/config.ts`）作为注入项；
  2. 由 `src/lib/collaboration-runtime-service/index.ts` 在创建 runtime 时注入实现；
  3. 删除模块内的直接 import；
  4. 在 `npm run lint` 中加 `no-restricted-imports` 规则禁止 `src/modules/collaboration-runtime/**` 引用 `@/lib/**` 与 `@/components/**`。

### ARCH-RT-02 ｜ 三处「runtime」共存 + 「bridge」概念二义

**状态：** Resolved（Story 9.27）

- **位置：** `src/modules/collaboration-runtime/`、`src/lib/collaboration-runtime-bridge/`、`src/lib/collaboration-runtime-service/`、`src/modules/collaboration-runtime/bridge/`
- **现象：**
  - `src/modules/collaboration-runtime/`：核心模块（设计文档唯一记录）
  - `src/lib/collaboration-runtime-bridge/`：执行编排层（multi-agent-executor 等，文档未记录）
  - `src/lib/collaboration-runtime-service/`：API/会话管理层（文档未记录）
  - `src/modules/collaboration-runtime/bridge/`：模块内 PI Agent 桥接（含 agent-registry，违反围栏）
- **风险：** 4 个目录里 2 个名字含「runtime」、2 个名字含「bridge」，含义全不相同。CLAUDE.md §多 Agent 协作运行时架构 仅声明前者，后两者无文档定位 → 新成员无法理解层次划分，AI 工具检索时高度混淆。
- **治理动作：**
  1. 在主设计文档 §8（模块目录结构）显式新增「集成边界层」小节，定义三件套职责：
     - `src/modules/collaboration-runtime/`：纯模块（与 OriginOS 解耦，可独立测试）
     - `src/lib/collaboration-runtime-service/`：会话/SSE/持久化集成层（连接 API ↔ 模块）
     - `src/lib/collaboration-runtime-bridge/`：多 Agent 执行编排层（manifest → 拓扑 → 子进程）
  2. 将 `src/modules/collaboration-runtime/bridge/` 改名为 `src/modules/collaboration-runtime/integrations/`（避免 bridge 二义），同时配合 ARCH-RT-01 的 DI 化。
  3. 在 CLAUDE.md v2.4.0 中补全三件套定义。

### ARCH-RT-03 ｜ `CollaborationRuntime` 类沦为空壳，DI 接口形同虚设

**状态：** Deferred（Phase 3 Story 9.19 前必须处理）

- **位置：** `src/modules/collaboration-runtime/config.ts:68-100`、`src/lib/collaboration-runtime-service/index.ts:170-195`
- **现象：** 设计文档 §5.5 强调 `CollaborationRuntimeDeps` 是模块边界，但实际实现中：
  - `runtime.createSession` 只维护一个永不读取的本地 Map；service 层另维护 `sessions` Map。
  - `agentEngine / toolExecutor / ontologyStore` 三个核心依赖在 service 中以 `throw new Error("Not implemented in Phase 1")` stub。
  - 真实执行路径绕过 runtime 实例，`API → service.executeSession → bridge.executeMultiAgentDag → AgentSpawner` 直连。
- **风险：** 「DI 注入」合规仅停留在类型层；实际架构是「Service 直接调 Bridge 直接 spawn 子进程」。后续 Phase 3 引入 Queen-Led / Pool / Consensus 时，没有清晰注入位点。
- **治理动作：**
  1. 短期：明确把 `runtime.createSession` 标记为 deprecated（保留以避免破坏导出面），由 service 层负责会话生命周期。
  2. 中期（建议在 9.27 治理 story 中执行）：将 `executeMultiAgentDag` 整体迁入 `src/modules/collaboration-runtime/engine/multi-agent-orchestrator.ts`，bridge 层退化为「manifest 加载 + 进程注入」薄壳，让 runtime 真正成为执行入口；DI 接口（spawner、prompt-builder、event-emitter、blackboard）在迁移时落实。

### ARCH-RT-04 ｜ Human-in-the-Loop 暂停/恢复存在三处实现 bug

**状态：** Resolved（Story 9.27）

- **链路：** `agent-worker.mts → agent-spawner.ts → multi-agent-executor.ts → dag-executor.ts`
- **现象：**
  1. `agent-spawner.ts:flushLines` 仅识别 `ready / event / error` 三类消息，**未处理 worker 端发出的 `{type:"waiting"}`** → `pendingCommand` 不会及时 resolve，依赖 5 分钟超时（`agent-spawner.ts:318-341`、worker 侧 `agent-worker.mts:1322-1328`）。
  2. `multi-agent-executor.ts:362` resume 分支构造的 `events: RuntimeEvent[] = []` 是空数组，`extractAgentOutput([])` 永远返回空字符串 → resume 通过后**当前节点的真实产出无法被下游消费**。
  3. `dag-executor.ts:190-194` 的 `resumeNode` 直接将 `status` 置为 `completed` 跳过下游执行；与 bridge 层「重新调用 agentExecutor 拿 existingProc」的二次执行路径耦合，状态机语义不一致。
- **风险：** Story 9.26 自评为「Complete」，但此暂停链路在多节点场景会出现：等待超时、上游产出丢失、下游用空字符串触发。直接影响人在回路场景下的可用性。
- **治理动作：** 在 Epic 9 新增 **Story 9.27（架构治理与 HITL 链路修复）** 处理。详见 §4。

---

## 2. High 风险项

### ARCH-RT-05 ｜ 大量已实现模块未在生产路径接线（死代码）

**状态：** Partially Resolved / Deferred

| 模块 | 文件 | 状态 |
|------|------|------|
| `ConflictDetector` | `engine/conflict-detector.ts`（550 行） | ✅ 单测通过、❌ 未被 service/bridge 引用 |
| `CapabilityMatcher` | `engine/capability-matcher.ts` | ✅ 单测、❌ 未引用 |
| `SupervisorMode` | `engine/supervisor-mode.ts` | ✅ 单测、❌ 未引用 |
| `ContractNetProtocol` / `SubscribeNotifyProtocol` / `AclProtocol` | `protocol/` | ✅ 单测、❌ 未引用 |
| `NodeSandboxExecutor` | `sandbox/node-executor.ts` | ✅ 单测、❌ 未引用 |
| `CostController` / `Tracer` | `observability/` | ✅ 单测、❌ 未引用 |

**风险：** 设计文档 §4 §5 §6 §11 §12 描述这些为运行时核心组件，但实际 DAG 执行链路完全绕开。「Phase 1+2 Complete」的合规结论被误读为「这些组件在运行」。

**治理动作：**
1. 在主设计文档每个组件章节标注「执行接线状态」（Wired / Available / Not-wired）。
2. 在 Story 9.27 中至少接线 ConflictDetector + CostController（两者属于设计文档 §11 §12 安全/可观测性约束的强承诺）。
3. 其余组件标记为「保留至 Phase 3」并在 Epic 9 README 故事表新增列「接线状态」。

### ARCH-RT-06 ｜ Blackboard 在 DAG 路径未真正运转

**状态：** Resolved（Story 9.27）

- **位置：** `session/blackboard.ts`（650 行）、`bridge/multi-agent-executor.ts:294`
- **现象：** Blackboard 被创建（service/index.ts:262）、暴露 `/api/collaboration/sessions/[id]/blackboard`，但 DagExecutor 与 multi-agent-executor 内**无任何 `blackboard.write` 调用**；当前是 Workflow 直传 `upstreamResults: Map<string,string>`。
- **风险：** 设计文档 §3 强调「黑板是协作运行时的中枢」，与实际 Workflow 链路完全背离；System 模式（mode === "system"）也走同一 DagExecutor 而无差异，黑板只在 UI 调试视图里可见。
- **治理动作：**
  1. 在主设计文档 §5.3 新增「Workflow 模式当前的黑板使用约定」小节，明示「Workflow 模式以 upstream 直传为主，黑板用于审计与跨步调试」。
  2. 将 DAG 节点的输入/输出在执行前后写入 Blackboard（key 约定 `node:{nodeId}:input` / `node:{nodeId}:output`），统一两条路径。

### ARCH-RT-07 ｜ System 模式无独立执行器

**状态：** Partially Resolved（最简 notify 分发已接线；独立执行器 Deferred）

- **位置：** `engine/topology-parser.ts:156-161` `determineMode` + `dag-executor.ts:215-235` `buildDag`
- **现象：** 「System 模式」目前仅是 mode 字段；执行仍走 DagExecutor（仅消费 trigger/depend 边）。Subscribe-Notify、ContractNet 协议虽已实现但未接线。
- **风险：** 设计文档 §1.4 §5.3 承诺 Workflow vs System 双模式自动判定 + 差异化执行，实际只有 Workflow 一条路径。后续 Phase 3 共识/Queen-Led 会基于 System 模式构建。
- **治理动作：**
  1. 主设计文档 §5.3 增加「当前实现状态」小节：明确 System 模式为 Phase 3 占位。
  2. 在 Story 9.27 中至少把 `notify` 边的事件分发接线（即使先用最简实现），让模式判定有真实差异。

### ARCH-RT-08 ｜ 协作 Prompt 构建链路未在执行路径调用

**状态：** Resolved（Story 9.27）

- **位置：** `src/lib/integrations/pi-agent/project-agent/collaboration-prompt.ts`、`project-collaboration-context.ts`
- **现象：** Story 9.26 / multi-agent-prompt-architecture.md 定义了 `buildCollaborationPrompt()` 7 层 prompt，但 grep 显示生产路径仅 worker 端的 `initializeOriginOSAgent / initializePersistentAgent` 入口；`buildCollaborationPrompt` 仅在 index.ts 导出与单测中出现。
- **风险：** Agent Worker 实际拿到的 system prompt 不含 Data.md/Process.md/协作协议，与文档承诺不符。
- **治理动作：**
  1. 在 worker 初始化阶段判断：当存在 `project-collaboration-context` 时，调用 `buildCollaborationPrompt()` 替代默认 prompt。
  2. 在 multi-agent-prompt-architecture.md 增加「调用入口表」明确每个入口的 prompt 来源。

### ARCH-RT-09 ｜ `any / as any` 在 bridge 层 38 处滥用

**状态：** Resolved（Story 9.27）

- **位置：** `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts:204,213,226 ...`
- **现象：** manifest 适配处大面积 any。
- **违反：** AGENTS.md §代码层面禁止 #1「使用 any 类型」。
- **治理动作：** 在 9.27 中为 `agents.json` manifest 定义 zod schema 或类型守卫；统一在边界做一次解析。

---

## 3. Medium 风险项

### ARCH-RT-10 ｜ 重复进程注册表

**状态：** Resolved（Story 9.27）

- `collaboration-runtime-service/project-agent-registry.ts` 已删除。

### ARCH-RT-11 ｜ 数据存储路径文档不一致

**状态：** Resolved（Story 9.27）
- CLAUDE.md §数据存储规约：`data/collaboration-sessions/`（全局）；Story 9.2：`data/projects/{projectId}/collaboration-sessions/`（项目内）。需统一为「项目内」并更新 CLAUDE.md。

### ARCH-RT-12 ｜ 命名同义词漂移

**状态：** Resolved（Story 9.27）

- 「Workflow 模式」/「DAG 模式」/「模式 A」三种叫法并存；「Supervisor」与「Queen」概念演进关系未声明。需在主设计文档术语表统一。

### ARCH-RT-13 ｜ 仓库根目录遗留 `excalidraw.log`

**状态：** Resolved（Story 9.27）

- `.gitignore` 已加 `excalidraw.log`；现存日志文件已删除。

---

## 4. 治理动作总览

| 编号 | 严重度 | 治理交付物 | 归属 | 状态 |
|------|--------|-----------|------|------|
| ARCH-RT-01 | Critical | DI 化 + lint 规则 | Story 9.27 | ✅ Resolved |
| ARCH-RT-02 | Critical | 三件套定位文档 + bridge→integrations 改名 | 设计文档 §8 + Story 9.27 | ✅ Resolved |
| ARCH-RT-03 | Critical | runtime 入口归位 | Story 9.27（Phase 3 前） | ⏳ Deferred（9.19 前） |
| ARCH-RT-04 | Critical | HITL 链路 3 个 bug 修复 | Story 9.27 | ✅ Resolved |
| ARCH-RT-05 | High | 接线状态标注 + ConflictDetector/CostController 接线 | 设计文档 + Story 9.27 | ✅ Resolved |
| ARCH-RT-06 | High | Workflow 路径黑板写入 | Story 9.27 | ✅ Resolved |
| ARCH-RT-07 | High | System 模式状态声明 + notify 边最简接线 | 设计文档 + Story 9.27 | ✅ Resolved |
| ARCH-RT-08 | High | `buildCollaborationPrompt` 接线 | Story 9.27 | ✅ Resolved |
| ARCH-RT-09 | High | bridge 层 any 清理 | Story 9.27 | ✅ Resolved |
| ARCH-RT-10 | Medium | 删除遗留 registry | Story 9.27 | ✅ Resolved |
| ARCH-RT-11 | Medium | 数据路径文档统一 | CLAUDE.md v2.4 + Story 9.27 | ✅ Resolved |
| ARCH-RT-12 | Medium | 术语表统一 | 设计文档 §1.4 | ✅ Resolved |
| ARCH-RT-13 | Medium | `.gitignore` 修订 + 日志删除 | Story 9.27 | ✅ Resolved |

---

## 5. 后续

- Story 9.27（架构治理与 HITL 链路修复）已在 Epic 9 中创建，作为进入 Phase 3 高级特性（9.19–9.23）前的强制门禁。
- 本审查在每次 Phase 进入前重新执行一次（建议加入 PR 模板的「架构治理」勾选项）。
- 下一次审查时点：Story 9.27 完成后、Story 9.19 启动前。
