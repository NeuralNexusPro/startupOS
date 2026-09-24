# Design

## Context

见 [proposal.md](proposal.md)。当前 `CollaborationExecutionStore` 已持久化冻结 contract、Run 与初始 WorkItem，并支持 Run 的暂停、恢复与取消；它尚未拥有 attempt、lease、Worker 回执、验证结论和 Evidence 对账状态。任务完成事实仍属于 `pi-tasks`，运行时只能通过受控 public adapter 递交 Evidence。

## Goals / Non-Goals

**Goals:**

- 为 9.42 建立单一 Run ledger 内的 WorkItem attempt/lease、回执、验证和证据对账状态。
- 以注入端口连接 Worker、Verifier 与 Evidence Sink，避免 collaboration runtime 反向依赖 Agent、Web、Desktop 或 `pi-tasks` 私有实现。
- 使恢复逻辑基于持久回执补齐缺失记录，而非重复副作用。

**Non-Goals:**

- 不生成、编辑、选择或热更新 Workflow/拓扑。
- 不创建第二套 Task、Step、Criterion 或 Evidence 状态源。
- 不提供 9.43 看板 UI、跨进程 IPC 或外部 Worker SDK。

## Decisions

### 1. 将 attempt ledger 与 WorkItem 放入冻结 Run 快照

Run 是 WorkItem、契约版本和 lease 的共同事实边界，因此在同一原子 JSON ledger 中保存每个 WorkItem 的当前 attempt、历史回执和验证/Evidence 对账引用。状态修改经现有 per-run 队列和原子 rename 串行化。

备选方案是在独立 JSONL 写 attempt。该方案更适合高吞吐，但当前 MVP 的 WorkItem 数量有限，且跨文件原子恢复会增加事实分叉风险。

### 2. 以端口注入执行、验证与 Evidence 提交

`CollaborationExecutionStore` 定义最小 `WorkItemWorkerPort`、`WorkItemVerifierPort`、`WorkItemEvidenceSink`。宿主负责连接 Agent runtime 和 9.41 公共 task adapter；Core 仅传递引用和结构化结果。

备选方案是 runtime 直接调用 Agent 或解析 `pi-tasks` entries。该方案违反 AGENTS.md 的模块边界并绕过公共任务 API。

### 3. 接纳顺序为 intent → worker receipt → verifier result → evidence receipt

每个阶段落盘后才进入下一阶段。恢复时根据缺失阶段执行下一步；同 requestId/payloadHash 返回已有回执，不同内容拒绝。无法证明副作用的阶段显式进入 `needs_review`。

### 4. lease epoch 作为迟到输出围栏

每次 retry 创建更高 epoch 的 attempt。任何提交必须同时匹配 attemptId 和 leaseEpoch，Run paused/canceled 时拒绝。该约束不依赖 wall-clock，也不在恢复时自动领取新 lease。

## Risks / Trade-offs

- [Run ledger 增长] → 仅保存有界 attempt/receipt 摘要与 artifact 引用，正文留在 artifact 所有者。
- [真实 Worker 接口差异] → 以端口契约隔离，缺少宿主能力返回明确 unavailable，不使用 mock success。
- [Evidence Sink 副作用未知] → 要求幂等 key；无法确认的回执转人工核对。
- [现有 Run schema 兼容] → 读取时为缺失字段提供只读默认值；旧 Run 不能写入新执行状态。

## Migration Plan

1. 新建 Run 使用带 ledger 的 schema；读取旧 Run 时保留原生命周期和 frozen contract。
2. 发布前运行 Core 定向测试、typecheck、边界检查与 9.42 回归。
3. 回滚时停止暴露新的执行入口；已经记录的 receipt、验证与 Evidence 引用保留供人工核对，不能删除或重放。

## 实施边界

- Core runtime 工作包：`packages/core/src/modules/collaboration-runtime/facade/contract-execution.ts` 及其测试。
- 规格/验收工作包：本 change 和 `docs/specs/epic-9/story-9.42/`。
- 不允许修改 Web、Desktop、`pi-tasks`、生成物或运行数据；互不重叠的工作包才可并行。
