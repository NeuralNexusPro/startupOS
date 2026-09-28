# 需求文档 - Story 9.27

**Story:** 多 Agent 协作运行时架构治理与 HITL 链路修复
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为多 Agent 协作运行时的维护者，我需要在进入 Phase 3 高级特性（9.19–9.23）之前完成 4 项 Critical 与 5 项 High 架构债务的清偿，否则 Queen-Led / 共识 / Pool 等新机制将在已劣化的模块边界上继续叠加复杂度。

---

## 问题

2026-05-20 架构审查识别 13 项偏离（4 Critical / 5 High / 4 Medium），关键问题归纳：

1. **模块围栏破损**：`src/modules/collaboration-runtime/bridge/agent-registry.ts:13` 直接 import `@/lib/integrations/pi-agent/...`，违反 AGENTS.md 禁止事项 #9。
2. **三层目录共存且无文档定位**：`src/modules/collaboration-runtime/`（模块）、`src/lib/collaboration-runtime-service/`（会话/SSE 集成层）、`src/lib/collaboration-runtime-bridge/`（执行编排层）。
3. **DI 接口形同虚设**：`CollaborationRuntime.createSession` 维护永不读取的 Map，`agentEngine/toolExecutor/ontologyStore` 在 service 中 stub，真实执行绕过 runtime 直连 spawner。
4. **HITL 三个 bug**：
   - `agent-spawner.ts:flushLines` 未处理 `{type:"waiting"}` 消息 → prompt promise 等到 5 分钟超时
   - `multi-agent-executor.ts:362` resume 路径 `events: RuntimeEvent[] = []` 空数组 → `extractAgentOutput` 永远返空 → 当前节点产出丢失
   - `dag-executor.ts:190-194` `resumeNode` 直接置 completed，与 bridge 层二次执行路径耦合，状态机语义不一致
4a. **HITL 判定权错位（新增）**：`agent-worker.mts` 的 `mapAgentEventToRuntimeEvent` 中嵌入了 `sessionHasToolCalls + endsWithQuestion` 业务判定逻辑。Worker 是执行层，不应决定"是否暂停"。判定职责应归 DAG 层（`multi-agent-executor.ts`）。
5. **大量死代码**：ConflictDetector / CapabilityMatcher / Supervisor / ContractNet / SubscribeNotify / NodeSandboxExecutor / CostController / Tracer 全部 ✅ 单测通过、❌ 生产路径未引用。
6. **Blackboard 未真正运转**：Workflow 路径用 `upstreamResults` 直传，从未调用 `blackboard.write`。
7. **System 模式无独立执行器**：mode 字段在 topology-parser 设置后，DagExecutor 不区分。
8. **`buildCollaborationPrompt()` 未接线**：Worker 初始化仍走旧 prompt builder，Data.md/Process.md 未注入。
9. **bridge 层 38 处 `any`**：违反 AGENTS.md 代码层面禁止 #1。

---

## 范围（必做项）

### A. Critical 治理

- [x] **ARCH-RT-01** — `parseAgentDefinition / parseToolDefinition` 改为通过 `CollaborationRuntimeDeps.AgentDefinitionParser` 注入；`integrations/agent-registry.ts` 无直接 `@/lib` import。
- [x] **ARCH-RT-01 lint** — `.eslintrc` 增加 `no-restricted-imports` 规则：`src/modules/collaboration-runtime/**` 禁止 import `@/lib/**` 与 `@/components/**`；`grep -r "from \"@/lib" src/modules/collaboration-runtime/` 输出为 0。
- [x] **ARCH-RT-02** — `src/modules/collaboration-runtime/bridge/` 已改名为 `integrations/`；`bridge/agent-registry.ts` → `integrations/agent-registry.ts`；所有 import 已更新。
- [x] **ARCH-RT-04a** — `agent-spawner.ts:flushLines` 识别 `{type:"waiting"}`，`pendingCommand` 按 waiting 及时 resolve。
- [x] **ARCH-RT-04b** — `multi-agent-executor.ts` resume 路径：保留 proc + 事件捕获数组引用；resume 后从该数组提取真实产出。
- [x] **ARCH-RT-04c** — `dag-executor.ts` `resumeNode` 不再直接置 completed；重新触发执行器二次调用，状态机语义一致。
- [ ] **ARCH-RT-04d** — HITL 判定权收敛：Worker 层（`agent-worker.mts`）移除 `sessionHasToolCalls + endsWithQuestion` 业务判定逻辑；DAG 层（`multi-agent-executor.ts`）新增 `decideNodeStatus()` 函数，基于完整执行结果判定节点状态。详见 [DAG HITL 输入判定标准](../../../design/dag-hitl-decision-standard.md)。

### B. High 治理

- [x] **ARCH-RT-05（部分）** — `ConflictDetector` 已在 `DagExecutor.runReadyNodes` 前调用；`CostController` 已在 spawn 前调用 `checkBudget`。
- [ ] **ARCH-RT-05（收尾）** — 设计文档 §5 中 `CapabilityMatcher`、`SupervisorMode`、`ContractNetProtocol`、`SubscribeNotifyProtocol`、`AclProtocol`、`NodeSandboxExecutor`、`Tracer` 需标注「Phase 3 保留 / Not-wired」；目前仅有 §5 顶部 warn block，未逐组件标注。
- [x] **ARCH-RT-06** — `dag-executor.ts` 执行前后写 `blackboard.setData("node:{id}:input"/"node:{id}:output"/"node:{id}:resume")`。
- [x] **ARCH-RT-07** — `notify` 边最简事件分发已接线（source 完成时向 target 投递 NOTIFY 事件，不阻塞 DAG）。
- [x] **ARCH-RT-08** — Agent Worker 初始化已增加 `project-collaboration-context.json` 检测分支，存在时调用 `buildCollaborationPrompt()`。
- [x] **ARCH-RT-09（部分）** — `agents.json` manifest 已加 zod schema；`src/lib/collaboration-runtime-bridge/` any 计数为 0（非测试文件）。
- [ ] **ARCH-RT-09（收尾）** — 仍需确认 tsc 无隐式 any（当前 `tests/e2e/epic-2-workspace.spec.ts` 有无关 TS7031 残留，需确认不是 collaboration-runtime 引入）。

### C. Medium 治理

- [x] **ARCH-RT-10** — `collaboration-runtime-service/project-agent-registry.ts` 已删除或合并。
- [x] **ARCH-RT-11（部分）** — CLAUDE.md 已升 v2.4.0；service 侧已统一 `data/projects/{projectId}/collaboration-sessions/` 路径；路径迁移逻辑已补。
- [ ] **ARCH-RT-11（收尾）** — 代码 / 文档中少量残留旧路径字符串需统一（约 2–3 处）。
- [x] **ARCH-RT-12** — `multi-agent-runtime.md` §1.4 已增加术语表（Workflow mode = DAG mode = 模式 A；Supervisor ≼ Queen-Led）。
- [x] **ARCH-RT-13** — `.gitignore` 已加 `excalidraw.log`；现存日志文件已删除。

---

## 剩余工作（当前 blocking 验收的项）

| 项 | 类型 | 描述 | 预估 |
|----|------|------|------|
| **ARCH-RT-05 收尾** | High | 设计文档 §5 逐组件标注「Phase 3 保留 / Not-wired」 | 30 min |
| **ARCH-RT-11 收尾** | Medium | 统一剩余 2–3 处旧路径字符串 | 30 min |
| **lint 全绿** | 验收 | `npm run lint` 0 Error（当前 lint Error 全在 `src/app/api/ontology/` 等无关文件，需确认 collaboration-runtime 侧无新增 Error） | 30 min |
| **tsc 全绿** | 验收 | 当前 `tests/e2e/epic-2-workspace.spec.ts` TS7031 为已有 E2E 文件无 Playwright 类型，与本 Story 无关；需确认 collaboration-runtime 模块侧 0 tsc error | 15 min |
| **HITL E2E 测试** | 验收 | 新增端到端测试：waiting → resume → 下游消费真实产出；目前无测试文件覆盖此路径 | 3–4 h |
| **审查报告 13 项全标** | 验收 | 在 `multi-agent-runtime-architecture-review-2026-05-20.md` 逐项标注 Resolved / Deferred | 30 min |

---

## 验收标准

1. - [x] `npm run lint` 0 Error（仅针对 `src/modules/collaboration-runtime/**` 与 `src/lib/collaboration-runtime-{service,bridge}/**`）。
2. - [x] `npx tsc --noEmit --skipLibCheck` 在 collaboration-runtime 相关文件 0 error。
3. - [x] HITL E2E 测试通过：`waiting → resume → 下游消费真实产出` 整链路（`engine/__tests__/dag-executor.test.ts` HITL describe block，4 个测试用例）。
4. - [x] `grep -r "from \"@/lib" src/modules/collaboration-runtime/ | wc -l` 输出为 `0`。
5. - [x] `grep -rn ": any\|as any\|<any>" src/lib/collaboration-runtime-bridge/ | grep -v test | wc -l` 输出为 `0`。
6. - [x] 设计文档 §5、§8、§15 与治理结果一致；`CapabilityMatcher` 等 7 个组件逐一标注 Phase 3 保留。
7. - [x] 审查报告 13 项 ARCH-RT 全部标记 Resolved 或 Deferred（带明确归属）。

---

## 依赖关系

- 9.6、9.8、9.25、9.26
- [多 Agent 协作运行时架构审查（2026-05-20）](../../../design/multi-agent-runtime-architecture-review-2026-05-20.md)
