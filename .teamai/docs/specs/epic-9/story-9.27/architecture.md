# 架构设计 - Story 9.27

**Story:** 多 Agent 协作运行时架构治理与 HITL 链路修复
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 技术栈

- TypeScript
- ESLint（依赖规则检查）
- 多 Agent 协作运行时模块

---

## 变更影响范围

- `src/modules/collaboration-runtime/{integrations/,config.ts,engine/dag-executor.ts,sandbox/agent-spawner.ts,sandbox/agent-worker.mts}`
- `src/lib/collaboration-runtime-bridge/{multi-agent-executor.ts,event-mapper.ts}`
- `src/lib/collaboration-runtime-service/{index.ts}` （project-agent-registry.ts 已删）
- `src/lib/integrations/pi-agent/project-agent/{collaboration-prompt.ts,project-collaboration-context.ts}`（已接线）
- `docs/design/multi-agent-runtime.md`（§5 收尾待完成）
- `CLAUDE.md`（v2.4.0 已升）、`.eslintrc`（规则已加）、`.gitignore`（已加 excalidraw.log）

---

## 模块设计

### Critical 治理

#### ARCH-RT-01: 模块围栏修复
- `parseAgentDefinition / parseToolDefinition` 改为通过 `CollaborationRuntimeDeps.AgentDefinitionParser` 注入
- `integrations/agent-registry.ts` 无直接 `@/lib` import
- `.eslintrc` 增加 `no-restricted-imports` 规则

#### ARCH-RT-02: 目录重命名
- `src/modules/collaboration-runtime/bridge/` → `integrations/`
- `bridge/agent-registry.ts` → `integrations/agent-registry.ts`

#### ARCH-RT-04: HITL Bug 修复
- **04a**: `agent-spawner.ts:flushLines` 识别 `{type:"waiting"}`
- **04b**: `multi-agent-executor.ts` resume 路径保留 proc + 事件捕获数组引用
- **04c**: `dag-executor.ts` `resumeNode` 重新触发执行器二次调用
- **04d**: HITL 判定权收敛到 DAG 层（`decideNodeStatus()` 函数）

### High 治理

#### ARCH-RT-05: 死代码标注
- 设计文档 §5 逐组件标注「Phase 3 保留 / Not-wired」
- 组件：`CapabilityMatcher`、`SupervisorMode`、`ContractNetProtocol`、`SubscribeNotifyProtocol`、`AclProtocol`、`NodeSandboxExecutor`、`Tracer`

#### ARCH-RT-06: Blackboard 接线
- `dag-executor.ts` 执行前后写 `blackboard.setData("node:{id}:input"/"node:{id}:output"/"node:{id}:resume")`

#### ARCH-RT-07: notify 边事件分发
- source 完成时向 target 投递 NOTIFY 事件，不阻塞 DAG

#### ARCH-RT-08: buildCollaborationPrompt 接线
- Agent Worker 初始化增加 `project-collaboration-context.json` 检测分支

#### ARCH-RT-09: any 清理
- `agents.json` manifest 加 zod schema
- `src/lib/collaboration-runtime-bridge/` any 计数为 0

### Medium 治理

#### ARCH-RT-10: 删除死代码
- `collaboration-runtime-service/project-agent-registry.ts` 已删除或合并

#### ARCH-RT-11: 路径统一
- service 侧统一 `data/projects/{projectId}/collaboration-sessions/` 路径
- 代码 / 文档中残留旧路径字符串需统一（约 2–3 处）

#### ARCH-RT-12: 术语表
- `multi-agent-runtime.md` §1.4 增加术语表

#### ARCH-RT-13: 日志清理
- `.gitignore` 加 `excalidraw.log`
- 现存日志文件已删除

---

## 代码变更

### 已完成

- [x] `parseAgentDefinition / parseToolDefinition` 依赖注入
- [x] `bridge/` → `integrations/` 重命名
- [x] HITL bug 修复（04a/04b/04c）
- [x] Blackboard 接线
- [x] notify 边事件分发
- [x] `buildCollaborationPrompt()` 接线
- [x] `agents.json` zod schema
- [x] `project-agent-registry.ts` 删除
- [x] 路径统一
- [x] 术语表
- [x] 日志清理

### 待完成

- [ ] ARCH-RT-04d: HITL 判定权收敛
- [ ] ARCH-RT-05 收尾: 设计文档 §5 逐组件标注
- [ ] ARCH-RT-09 收尾: 确认 tsc 无隐式 any
- [ ] ARCH-RT-11 收尾: 统一剩余 2–3 处旧路径字符串
- [ ] HITL E2E 测试
- [ ] 审查报告 13 项全标
