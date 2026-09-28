# ADR-010：受控 Pi Task Runtime 公共边界

- **状态：** Accepted
- **日期：** 2026-08-01
- **关联：** Epic 9 / Story 9.41 / A-02
- **取代：** [ADR-009](./ADR-009-pi-tasks-runtime-boundary.md)
- **决策所有者：** Agent Runtime
- **OpenSpec：** `add-pi-task-public-command-adapter`

## 背景

ADR-009 拒绝 stock Pi Runtime `0.80.10` 与 stock `pi-tasks@0.2.0` 的直接组合，
原因是宿主缺少标准 tool pipeline 的公共调用入口，Task extension 缺少稳定
revision/cursor、幂等命令、可靠 replay 和不可绕过的 Evidence Gate。

A-02 在不启用 Story 9.41 产品 Task Runtime 的前提下，为这些问题建立了三个受控
公共边界，并完成契约、普通聊天和桌面打包布局回归。

## 决策

**接受以下精确组合，作为 Story 9.41 后续产品实现唯一允许的 Task Runtime 边界：**

| 组件 | 精确版本或基线 |
|---|---|
| `@originos/pi-agent-adapter` | `0.80.10`，公共子路径 `task-runtime` |
| `@earendil-works/pi-coding-agent` | `0.80.10` + 受控最小 patch |
| `@originos/pi-tasks` | `0.2.0-originos.1` |
| 上游 `pi-tasks` 基线 | `0.2.0` |
| Node.js | `24.14.0` |
| pnpm | `9.15.9` |

Story 9.41 后续代码只能依赖 `@originos/pi-agent-adapter/task-runtime` 的公开 DTO、
compatibility guard、allowlist 和 bridge，不得直接导入 runtime patch 类型或
`@originos/pi-tasks` 的私有 reducer/store。

## 边界设计

### Runtime host invoke

Pi Runtime patch 新增 `AgentSession.invokeRegisteredTool()`，在原 Session/current
branch 中复用既有 registry、schema validation、permission、`beforeToolCall`、
`afterToolCall` 和标准 tool lifecycle event。该方法只执行一个已注册工具，不伪造
assistant、tool result、turn 或 agent message。

### 受控 Task extension

`@originos/pi-tasks` 保留上游 reducer 作为 Task 状态机单一事实源，只增加：

- event envelope v2、单调 revision、branch cursor 和 state hash；
- `requestId + payloadHash` 幂等、CAS 和 mutation receipt；
- current branch、restart、compaction、重复与乱序 replay；
- public state event v2 与有界 snapshot；
- 从 schema、event 和 reducer 删除 `force_with_reason`。

旧 v1 forced completion 只能作为迁移数据读取，并标记为不可信完成。

### OriginOS Adapter

`@originos/pi-agent-adapter/task-runtime` 负责：

- 校验 Session、branch、revision、cursor、requestId 和 bridge epoch；
- 仅允许 Story 9.41 批准的 task tools；
- 关联 host invoke receipt 与 public state event；
- 对 stale scope、busy Session、timeout、reload 和迟到 event fail closed；
- 裁剪敏感错误和 oversized snapshot。

Adapter 不保存第二份 canonical Task state，不解析 Session 文件，也不复制 reducer。

## Evidence Gate

首版不存在强制完成路径。`task_complete` 必须由受控 reducer 检查 Step、Criterion、
Evidence 和 Blocker；缺失、失败、不可复现、旧 revision 或未解决 blocker 均拒绝完成。
OriginOS 产品层只能提交经过验证的 Evidence，不能根据 assistant 文本或普通工具
success 判定任务完成。

## 兼容与上游同步

- 精确版本、patch hash、schema fingerprint 和 owner 由 A-02 compatibility matrix
  管理，任一不匹配时 Task capability fail closed，普通聊天保持可用。
- 升级 Pi Runtime 或上游 `pi-tasks` 前，必须重新执行 Runtime、受控 package、Adapter、
  Core contract 和 Desktop package verification。
- 上游若提供等价公共 host invoke、revision/cursor、幂等 mutation 和不可绕过的
  Evidence Gate，可新建 Proposal 评估移除 patch/fork；不得静默切换。

## 回滚

按依赖逆序回滚：

1. 禁用产品 Task Runtime 入口，保留普通聊天；
2. 移除 Core 对 Adapter Task public export 的调用；
3. 移除 Desktop package verification 与 staging；
4. 移除 `@originos/pi-tasks` 受控 package；
5. 移除 Runtime patch。

A-02 尚未创建产品 Task、lease 或 UI 持久数据，因此当前阶段回滚不需要用户数据迁移。
Story 9.41 产品实施后，回滚必须先暂停 active Task 并保留 canonical ledger，不能把
未完成任务伪造为 completed。

## 影响

- Story 9.41 的公共集成阻塞已解除，可进入产品 Task Runtime 的独立 Proposal 实施。
- A-02 本身不实现任务入口、Task 卡片、completion policy、lease、受控续跑或恢复 UI。
- 普通聊天不加载 Task Runtime，继续只使用 Chat Completion Guard。
- Workflow、多 Agent、Worker、DAG 和新 Session 仍不属于 Story 9.41。

## 验证证据

- Runtime patch：`76afdbc`。
- 受控 Task extension：`9505f6f`，package tests `40/40`。
- Adapter：`10b87be`，audit/integration tests `22/22`。
- Core contract：`8f21d3f`，integration commit `8bb99d4`，tests `13/13`。
- Desktop packaging：`08da312`，integration commit `07ffed4`，verifier `6/6`。
- 普通聊天与会话恢复回归：`64/64`。
- A-02 完整回归：离线 frozen install、development layout、lint、type-check 和
  OpenSpec strict validation 通过。
- Windows x64、macOS x64/arm64 真包验证由 release workflow 执行，结果纳入 A-02
  verification goal；在平台证据齐备前不得宣称跨平台发布门禁完成。
