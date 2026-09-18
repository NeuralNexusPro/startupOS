# Design

## Context

ONT.2 的 `CanonicalOntologyStore` 已拥有 ontology 快照、facts JSONL、operations JSONL 和单文件队列；ONT.4 的纯函数 Validator 已统一本体与 Action Gate。当前缺少把两者组合成单一安全调用面的业务服务。详见 `proposal.md`。

## Goals / Non-Goals

**Goals:**

- 提供一个 core ontology 公共 OSDK，封装查询、门控、幂等与审计。
- 复用现有文件和类型，保持无数据库、无新依赖。
- 让 intent 中断可由相同请求恢复，不重复追加已存在事实。

**Non-Goals:**

- 不解释任意 `CanonicalRule.expression`，不调用外部系统。
- 不更新 ontology instance 状态或执行副作用；本 Task 的 Action 是经过门控的事实接纳命令。
- 不增加 Web/Desktop adapter、Context Projection API 或跨进程锁。

## Decisions

### 1. OSDK 位于 ontology feature 并组合现有公共能力

新增单个 `ontology-osdk.ts`，构造函数接收 `CanonicalOntologyStore`，默认实例化现有 Store。它只导入同 feature 的类型、Store 与 Validator，并从 `index.ts` 导出。这样下游不能遗漏 Gate，也不产生 Desktop/Web 反向依赖。

备选方案是把方法直接加到 Store；未采用，因为 Store 负责文件编码与队列，权限和 Action 语义属于业务边界。

### 2. facts 查询返回判别联合结果

查询先读取当前 ontology，再验证 identity/version 和过滤引用；成功返回 records，失败返回稳定 issues。`latestOnly` 以 `factId` 选择最大 revision，revision 相同时选择日志中最后一项，最后按接纳时间和原始位置稳定输出。

备选方案是抛业务异常；未采用，因为 ONT.4 已确定结构化拒绝契约。

### 3. Action 请求提交候选输出，OSDK 生成 canonical 引用

请求包含稳定输入 fact refs、输出草稿、`operationId`、`expectedRevision`、权限与审计上下文。OSDK 从当前 FactType 解析 conceptId，并生成 ontology ID/version、revision 和 factVersion，避免信任重复的调用方概念字段。每个输出 factId 的现有最高 revision 必须等于 expectedRevision。

Action 的 `ruleIds` 在没有 evaluator 时拒绝。允许静默通过会绕开业务约束；本轮新增 evaluator 会扩大 ONT5-T1 范围，因此明确失败是最小安全行为。

### 4. intent + facts + receipt 使用 operationId 恢复

同一 OSDK 实例按 operationId 串行提交。门控通过后写 intent，其中 metadata 保存基于规范化请求计算的 SHA-256 指纹及审计字段；随后逐条追加尚不存在的输出 facts，最后追加 accepted 回执。重试先核对指纹：终态直接返回；intent 则按完整 fact ref/operationId 查找已落盘输出，只补缺失项。

JSONL 文件之间没有事务，因此 intent 是恢复事实源。进程在 accepted 追加前中断时，重试可从 facts 重建回执。不同进程并发写同一 operationId 不在本地 MVP 保证内，唯一写入宿主仍由 adapter 选择。

备选方案是新建事务文件或数据库；未采用，因为 ONT.2 已定义 append-only 操作协议且 MVP 禁止数据库。

### 5. rejected 仅作为调用结果，不预写 operations

静态门控、版本、权限、输入、输出、revision 或 Rule 失败不写 intent/rejected 行，保证“写入前拒绝”并避免无效请求膨胀日志。已存在 operationId 的请求冲突也只返回 issue。accepted 与恢复所需的 intent 才进入 operations 日志。

## Risks / Trade-offs

- [跨文件提交可能中断] → intent 先落盘、事实按 operationId 去重、重试补齐并追加 accepted。
- [同一进程并发重复提交] → OSDK 对 operationId 使用 Promise queue。
- [跨进程并发没有文件锁] → adapter 必须保持单写宿主；跨进程锁留到真实多宿主需求出现时。
- [Rule 暂不可执行] → 有 ruleIds 的 Action 明确拒绝，不降级为允许。
- [全量扫描 JSONL 为 O(n)] → MVP 本地文件规模下复用 Store；达到性能门槛后再加派生索引，索引不得成为事实源。

## Migration Plan

新增 API 和类型，无既有调用方迁移。上线后下游可逐步改用 OSDK。回滚删除新增导出即可；已写 intent/facts/accepted 仍符合 ONT.2 文件格式。

## Subagent 实施边界

单一 Core subagent 在独立 Task worktree 修改 `packages/core/src/lib/features/ontology/` 及其定向测试。Proposal 集成者只修改 Story/OpenSpec/变更记录并执行合并与回归；两者不并行写相同文件。
