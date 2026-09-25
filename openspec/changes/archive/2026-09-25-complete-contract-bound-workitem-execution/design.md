# Design

## Context

动机见 [proposal.md](./proposal.md)。当前 ledger 在单个 per-run queue 中执行外部 Worker/Verifier/Evidence I/O，生产只注入 Evidence Sink。旧 Supervisor DAG 读取 latest manifest、动态派发、按 agentId 建进程 key、使用启发式 verifier 和内存 HITL，不符合 frozen contract 与恢复要求。

## Goals / Non-Goals

**Goals:** 将 ledger 变成可 CAS 恢复的阶段机，接入真实隔离 Worker、严格 verifier、ONT Action、持久 HITL 和唯一 composition。

**Non-Goals:** 不修改 Workflow 设计，不复用旧 Supervisor DAG，不让 collaboration runtime 依赖 Web/Desktop 或 pi-tasks 私有实现。

## Decisions

### 外部 I/O 之外的短事务阶段机

每个阶段先用 `expectedRevision` claim intent 并释放 mutation lock，执行外部 I/O 后以 attempt/lease/revision CAS 提交 receipt。Action 或 HITL 回调可在不重入同一长锁的情况下对账。

替代方案是继续持有 Promise queue 直到 Worker 返回；这会阻塞同 Run 的 Action 接纳并产生自死锁，因此不采用。

### 注入式 readiness 与 outcome ports

facade 定义 facts/state/permission/availability gate、Worker、verifier registry、ONT outcome commit、parent HITL 和 mutation lock ports；具体 Agent/ontology/task adapter 在上层 feature/server 组装，保持 Layer 2→Layer 1 单向依赖。

### 执行实例与逻辑 Agent 分离

Agent runtime key 使用 `${runId}:${workItemId}:${attemptId}`，logical agentId 只用于解析冻结契约。动态 WorkItem context 作为当前 turn 输入，不写 stable system prompt。

### verifier 必须显式版本化

Verifier registry 只解析 contract 声明的 verifierRef 与 evidenceSchemaRef；未知、placeholder 或 heuristic fallback 全部拒绝。LLM verifier 只有注册为显式版本化实现时才可用。

### HITL 是 Run ledger 状态

HITL request 保存 policy、trigger、parentSession、attempt、lease、question/options/status/decisionRef。回复经父 Session 公共端口并验证 lease；重启恢复同一 request。

### Evidence 与 Action 顺序

Worker candidate 先经 verifier，再经 ONT Action 接纳，最后使用 `{runId,workItemId,contractHash,evidenceHash}` 登记 Evidence；恢复只补缺失阶段。

### 单一 server composition

Core server factory 统一装配 store、锁、Worker、Verifier、HITL、ONT 与 Evidence；Web/Desktop 只注入 data root 和宿主能力。禁止两处手工拼装不同依赖。

实施边界：facade 阶段机；agent Worker/verifier integrations；project server composition 与双端适配；故障注入和平台验收，写入范围互不重叠时才可并行。

## Risks / Trade-offs

- [跨进程写冲突] → 文件锁或可验证 CAS mutation port，实例内 Map 只做优化。
- [Agent 中断无法 checkpoint] → 无持久 checkpoint 时保持 failed/blocked，不伪造恢复成功。
- [旧 Run schema] → 只读恢复或显式版本迁移，新执行禁止静默升级。
- [LLM verifier 非确定性] → 仅显式注册并保存完整 result ref/hash；不满足 schema 时拒绝。
- [预算统计来源不完整] → 缺 token/duration receipt 时 fail closed 或要求人工处理。

## Migration Plan

1. 先升级 ledger schema 与阶段 CAS，保持旧 production path 不启动新 WorkItem。
2. 接入 Worker/verifier/HITL/outcome adapter，并以 feature flag 仅运行新 contract Run。
3. 替换 Web/Desktop composition，执行进程重启与平台 smoke。
4. 回滚时停止新 Run，保留全部 intent/receipt；不得回退旧 Supervisor DAG继续写新 Evidence。
