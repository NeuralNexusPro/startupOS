## 背景

Story 9.41 要求由 `pi-tasks` 独占管理 Task、Step、Criterion、Evidence、Blocker 和完成状态。因此，在实现 task planning、continuation、UI projection 或 persistence 之前，OriginOS 必须具备受支持的 task tool 写入边界，以及用于读取当前 branch 状态的公共边界。

已提交的 `dev` 基线通过 commit `505d157c408dc3e27ef1c09f11bf860a92cc0203` 提供 `@originos/pi-agent-adapter@0.80.10`，并锁定 `@earendil-works/pi-agent-core`、`@earendil-works/pi-ai`、`@earendil-works/pi-coding-agent` 和 `@earendil-works/pi-tui` `0.80.10`。A-01 只验证该已提交版本，不根据未提交 workspace 或 package name 推断兼容性。

本变更涉及 Agent Runtime 维护者、Electron packaging 维护者、Story 9.41 实施者和 QA。本 Proposal 是兼容性与架构门禁，不暴露产品 Task API。

### 架构约束

- Integration 代码位于 `packages/core/src/lib/integrations/pi-agent/`，不得依赖 core features、Web 或 Desktop。
- Desktop verification scripts 可以依赖公共 package exports 和已构建应用 artifacts，但业务逻辑不得下沉到 Desktop。
- 生成的 `.next`、`dist-electron`、`node_modules`、release artifacts 和 runtime data 只能作为证据输入，不能作为源码修改入口。
- `pi-tasks` 私有 reducer、store、Session file 和 custom entry encoding 不属于允许使用的边界。
- 所有源码实施必须委派到隔离的 Task worktree。Proposal worktree 只负责规划、集成、ADR 汇总和验证。

## 目标与非目标

**目标：**

- 锁定一组兼容的 Pi Runtime 与 `pi-tasks` 依赖图。
- 证明宿主能够通过受支持的公共边界，在相同 Pi Session 和 branch 中调用所需的已注册 task tools。
- 证明 mutation 经过公共 schema validation 和 permission 检查，并通过公共 state event 暴露新 revision。
- 证明 current-branch replay、branch isolation 和 compaction preservation。
- 证明 Electron 开发态、Windows package 和 macOS package 的模块解析。
- 为后续 Story 9.41 Proposal 选定并记录可维护的命令边界。
- 产生可重复执行的自动化证据，而不是只进行人工源码检查。

**非目标：**

- 产品任务 UI、IPC、persistence、execution lease、completion policy routing、continuation 或 evidence verification。
- Multi-Agent、Workflow、Worker、DAG 或 Goal mode integration。
- 第二套 Task 状态机，或围绕 `pi-tasks` 私有内部实现构建兼容层。
- Desktop signing、notarization、release upload 或 publication。
- 同时支持多个 Pi Runtime 或 `pi-tasks` 版本。

## 设计决策

### 1. 验证已提交的 Pi Runtime 基线

A-01 SHALL 针对已经提交到 Proposal branch 的精确 Pi Runtime 版本运行。如果前置 Pi upgrade 尚未合并，实施必须在记录版本不匹配后停止，不能在 A-01 中静默吸收无关的 runtime upgrade。

**理由：** 依赖脏 workspace 或过渡状态得出的兼容性证据无法由 CI 或其他 worktree 重现。

**考虑过的替代方案：** 在同一 Proposal 中合并 Pi Runtime upgrade 和 `pi-tasks` 验证。该方案被拒绝，因为二者是可独立审查的变更，具有不同的回滚边界。

### 2. 优先使用公共 extension execution 命令路径

首选路径是 Pi Runtime 公共 API：它能够使用与 Agent 发起 tool call 相同的 Session、branch、schema validation、permission 和 custom entry 行为，调用已注册的 extension tool。

ADR 选择的边界 MUST 是以下方案之一：

1. 通过公共 API 由宿主调用已注册 extension tools；
2. 使用上游公共 `pi-tasks` command API；
3. 使用带有狭窄、版本化公共 command API 的受控 fork。

第三种方案必须在 ADR 中记录 owner、上游同步方式、兼容策略和移除条件。

初步公共 API 审计已确认：

- `AgentSession` 支持加载 extension、让模型调用 extension tool，并公开 `compact()` 等 Session API。
- Runtime 可取得已注册工具定义，但没有公开保留参数校验、`beforeToolCall`、权限检查、标准 tool event 和 `afterToolCall` 的宿主 `invokeTool`/`executeToolCall` API。
- 直接调用 `ToolDefinition.execute()` 会绕过标准 Agent tool-call 管线，不能作为获批边界。
- `pi-tasks@0.2.0` 只公开状态事件常量与类型，没有公开宿主 mutation command API。

因此 stock 组合预期无法满足本节要求。A-01 harness 必须以可重复方式确认该缺口；受控 fork/adapter 的产品化实现必须由后续独立 Proposal 承担。

**考虑过的替代方案：**

- 导入私有 reducer/store：拒绝，因为 package upgrade 可能静默破坏任务语义。
- 解析或修改 Session file：拒绝，因为会绕过 Pi branch ownership、validation、event 和 compaction。
- 伪造 custom entry：拒绝，因为 OriginOS 会成为未公开状态的第二写入方。
- 复制状态机：拒绝，因为会产生第二套 canonical Task model。

### 3. 公共 state event 和 branch replay 是读取事实源

Harness 使用 extension 公共 state event 获取实时 snapshot，并通过公共 replay/session API 从当前 Pi branch 重建状态。每个 snapshot 必须标识 Session、branch、Task、schema version 和 revision。

Mutation 成功必须同时满足：tool result 成功，且收到具有更高 revision 的匹配 state event。进程内 cache 只能协调测试，不能作为 canonical state；进程重启后必须能够重新构建。

`pi-tasks@0.2.0` 的 `pi-tasks:state` 事件 payload version 为 `1`，reason 为 `session_start`、`session_tree` 或 `task_mutation`，state snapshot 会省略内部 event history。公开 state 只有 `lastUpdatedAt`，没有稳定 revision、sequence 或 cursor。进程内递增序号和时间戳均不能满足跨重启、branch replay 和 CAS 语义。因此，stock event 只能用于 UI snapshot 观察，不能直接满足本节 mutation correlation 契约。

### 4. 实现契约 harness，而非产品 adapter

A-01 只引入：

- 版本和 export 审计；
- 可执行的 contract harness；
- 创建隔离测试 Session 所需的 fixtures；
- Electron package resolution smoke checks；
- ADR 和机器可读 compatibility report。

Harness 可以定义类似未来 `PiTaskCommandGateway` 的最小测试类型，但生产 service、feature state、IPC 和 renderer code 不属于本 Proposal。

**理由：** 门禁失败时必须能够完整移除验证代码，不在产品中残留半成品 Task Runtime。

### 5. 必须验证的契约序列

在同一个隔离的 Pi Session 和 branch 中依次执行：

1. `task_plan`；
2. 通过 `task_update` 执行至少一次 Step mutation；
3. 通过 `task_evidence` 登记 Evidence；
4. 选定版本公开 tool contract 支持时，验证 pause/block 与恢复；
5. `task_resume`；
6. Evidence 不足时调用 `task_complete` 并确认拒绝；
7. Evidence 有效后调用 `task_complete` 并确认成功。

每次 mutation 都记录 tool name、脱敏 arguments、result classification、前后 revision、Session identity、branch identity 和 state event correlation。Harness MUST 同时覆盖 invalid schema input、受支持时的 stale/wrong branch input、duplicate replay 和 process restart。

### 6. 把 compaction 和 branch 行为作为不变量验证

Harness 创建 branch divergence，并证明一个 branch 的 Task state 不会泄漏到另一个 branch。它通过锁定 Pi Runtime 支持的公共 compaction lifecycle 触发或模拟 compaction，并比较 replay 前后的 canonical Task fields。

如果 runtime 不提供确定性的 compaction trigger，ADR 必须记录该限制，测试使用最接近的受支持 lifecycle hook。P0 replay 和 branch isolation 不得豁免。

Pi Runtime `0.80.10` 公开 `AgentSession.compact(customInstructions?)`，`pi-tasks@0.2.0` 监听 `session_before_compact` 并追加 `task.snapshot`。该触发 API 不依赖操作系统，但实际摘要生成依赖模型。Contract test 必须注入 fake model 或固定 compaction result，使 lifecycle trigger 和 snapshot assertion 可重复；平台打包 smoke 另行验证 API 在 Windows/macOS 产物中可解析。

### 7. 打包验证使用源码驱动的 verification scripts

Electron development smoke 在 Node.js 24 和仓库指定 package manager 下运行。Windows/macOS 检查使用仓库 scripts 构建或检查 platform artifacts，并验证 packaged application 中所有 runtime imports 都可解析。

Package checks MUST 覆盖 CJS/ESM entry points、transitive dependencies、ASAR/unpacked placement 和 dynamic import behavior。无法在本地执行的平台测试委派给 CI，并在 A-01 通过前附加 artifact/log evidence。

### 8. 数据所有权与持久化

`pi-tasks` 拥有 Pi Session custom entries 中的全部 Task state。A-01 不写入 OriginOS production persistence。测试 Session 位于临时测试目录，compatibility report 位于受版本管理的文档目录。

Compatibility report 只包含 version、export name、capability result 和 hash。MUST NOT 包含 prompt、task content、credential、home path 或完整 tool output。

### 9. 并发、恢复、性能与安全

- 测试隔离 Session 和 branch identifier，并拒绝跨测试复用。
- Correlation wait 使用显式 timeout，并在 `finally` 中清理 subscription。
- Harness 崩溃后能够重启并 replay 同一 branch，不伪造 state。
- Event payload 日志必须有界并脱敏。
- 不在 Electron production path 增加同步文件或网络操作。
- 执行前审查 dependency installation script 和 package export。
- 遇到未知 schema version、缺失 public export、revision regression 或不明确 branch identity 时，harness 必须失败关闭。

### 10. Subagent 实施边界

源码和测试变更使用互不重叠的 worktree：

| 工作包 | 写入范围 | 集成契约 |
|---|---|---|
| Runtime/dependency 审计 | package manifests、lockfile、compatibility audit script/report | 精确版本矩阵和 public export inventory |
| Pi task contract harness | 测试专用 Pi integration harness 和 fixtures | 以 Session/branch/revision 为键的机器可读结果 |
| Electron packaging smoke | Desktop verification scripts 和 package tests | 基于锁定依赖图的平台解析报告 |
| ADR/集成 | Proposal worktree 中的 Proposal artifacts 和 ADR | 消费前三类证据，不修改产品源码 |

Pi Runtime 前置依赖满足后，前三个工作包可以并行。Proposal integration owner 负责合并各 Task branch，在不改写 Task evidence 的前提下解决冲突，运行完整测试并更新 ADR。

## 风险与权衡

- **选定 Pi Runtime 不提供公共 host tool invocation API** → 停止产品实施，评估上游 API 或受控 fork；不得回退到私有 state access。
- **A-01 开始时 Pi Runtime upgrade 尚未提交** → 保持 A-01 blocked，保留兼容 Proposal，不修改无关 runtime dependency。
- **`pi-tasks` 在不同 release 中修改公共 event 或 schema 行为** → 锁定精确版本和 lockfile，记录 export/schema fingerprint，升级时重新执行 A-01。
- **受控 fork 产生维护成本** → ADR 必须定义 owner、上游同步周期、compatibility suite 和移除条件。
- **本地 Windows/WSL 环境无法执行 macOS package** → 在 GitHub Actions macOS runner 中运行同一 smoke contract 并保留 CI evidence。
- **测试 harness 与未来生产调用产生偏差** → 根据公共 API 定义 command/state interface，并要求后续 adapter 复用相同 contract tests。
- **Compaction 行为不确定** → 使用公共 lifecycle hook；无法重现 state preservation 时门禁失败。

## 迁移方案

1. 把前置 Pi Runtime upgrade 合并到 `dev`，然后 rebase 本 Proposal branch。
2. 在隔离 Task worktree 中锁定候选 `pi-tasks` 版本，并生成完整 lockfile dependency graph。
3. 运行 runtime、replay/compaction 和 Electron packaging 工作包。
4. 把证据合并到 Proposal branch，并在 ADR 中选择 command boundary。
5. 运行 Story 9.41 A-01 contract cases 和 OpenSpec strict validation。
6. 只有全部强制证据存在时才把 A-01 标记为通过，并允许后续 Story 9.41 Proposal 开始。

回滚时通过 Proposal merge commit 移除候选 dependency、harness 和 verification scripts。由于不引入产品 API 或 persistence，普通聊天和 Agent runtime 行为保持不变。

## 已确认结论

- **Runtime 基线：** commit `505d157c408dc3e27ef1c09f11bf860a92cc0203`，`@originos/pi-agent-adapter@0.80.10`，Pi namespace 为 `@earendil-works/*@0.80.10`。
- **宿主 tool invocation：** stock Runtime 没有公开且保留标准 validation、permission 和 lifecycle 的宿主调用 API；直接调用工具定义不合格。
- **候选 task extension：** `pi-tasks@0.2.0` 与 Runtime `0.80.10` 的 extension、event、branch replay 和 compaction API 形状兼容，但仍需 Electron 产物和 contract tests。
- **State revision：** stock `pi-tasks@0.2.0` 不公开稳定 revision。受控公共 adapter/fork 必须由上游持久化 event sequence 提供或派生可重放 cursor，不能使用进程内计数或时间戳冒充。
- **Compaction：** `AgentSession.compact()` 是跨平台公共触发入口；测试必须隔离模型不确定性，Windows/macOS package resolution 仍需平台证据。
