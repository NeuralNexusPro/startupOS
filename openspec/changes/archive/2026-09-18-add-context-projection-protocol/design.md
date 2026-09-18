# Design

## Context

ONT.1 已提供 canonical source、ontology、concept 和 fact references。现有 collaboration EventStore 有 session cursor，但不了解 ontology/contract/task/work item 语义；本 Task 只补公共协议，不改变该存储。

## Goals / Non-Goals

**Goals:**
- 用一个明确身份元组隔离每个 work item attempt 的上下文。
- 让 snapshot、projection 和 checkpoint 共享 canonical references。
- 为后续持久化与恢复提供稳定类型边界。

**Non-Goals:**
- 不实现 append/query、snapshot codec、EventStore adapter 或恢复协调器。
- 不增加检索、GraphRAG、向量库或图数据库。

## Decisions

### 1. 复用 ONT.1 引用，不再定义第二套事实标识

snapshot 和 projection 直接使用 `CanonicalOntologyReference`、`CanonicalFactReference` 与 `CanonicalSourceReference`。替代方案是在 runtime 内复制简化类型；这会造成版本字段漂移。

### 2. 上下文身份使用显式字段

`projectId/taskId/sessionId/branchId/runId/workItemId/attemptId` 全部必需，context 再绑定 contract id/hash 与 ontology reference。替代方案是单个 opaque ID；它无法在日志和恢复阶段验证串线。

### 3. checkpoint cursor 保持 opaque string

协议只承诺 cursor 可稳定传递，不限定 EventStore 的数字序号。现有数字 cursor 可字符串化；后续 adapter 负责解释。

### 4. snapshot 与 projection 都是引用视图

对象绑定仅保存 slot 到 instance ID，事实/决策/来源只保存版本化引用；payload 只承载展示或查询所需的有限扩展。业务事实仍由 ONT facts 所有，运行状态仍由 collaboration-runtime 所有。

### 5. 不提前定义存储接口

ONT7-T1 只定义 DTO；append/query 与 JSONL/快照属于后续 ONT.2/ONT.7 工作包。避免出现只有假实现的接口。

## 依赖与写入边界

- 主实现：`packages/core/src/lib/features/ontology/types.ts`
- 公共入口：复用 ontology `index.ts`
- subagent 范围：ontology 类型文件与现有类型样例；Proposal owner 维护 Story/OpenSpec 文档
- 禁止依赖 Web、Desktop、collaboration-runtime 或 ontology-data-store 内部实现

## Risks / Trade-offs

- [协议先于存储] → 类型只保证信息完整，持久化/恢复能力不得在本 Task 宣称完成。
- [显式身份字段较多] → 换取可审计与防串线；不再增加包装类。
- [opaque cursor 需 adapter 转换] → 后续存储实现集中处理，不把 EventStore 细节泄漏到公共协议。

## Migration Plan

新增类型不切换现有调用方。后续 P2/runtime 按 Story 逐步采用；回滚只删除新增类型和文档，无数据迁移。
