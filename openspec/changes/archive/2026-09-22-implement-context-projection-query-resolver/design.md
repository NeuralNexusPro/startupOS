# Design

## Context

见 `proposal.md` 的动机。当前 `CanonicalOntologyStore` 已有 `appendProjection()` 与 `readProjections()`，但后者只能全量返回日志；`CanonicalOntologyOSDK` 已集中处理 ontology/version 校验、facts 精确匹配和结构化错误。ONT7-T2 应复用这两个边界，不建立第二套 store 或 validator。

## Goals / Non-Goals

**Goals:**

- 在 ontology 公共 API 内提供确定性的 projection 查询和 fact reference 解析。
- 使用完整 execution identity 与 ontology version 防止跨任务、跨 attempt 串线。
- 保持查询只读、向后兼容且可由 core 单测独立验收。

**Non-Goals:**

- 不实现 projection 写入门控、授权、lease/checkpoint 恢复或运行时调度。
- 不解析 decision 正文，不接入任何上层 package。
- 不为未验证的数据量增加索引或缓存。

## Decisions

### 1. 扩展现有 OSDK，不新增单实现 service 层

在 `CanonicalOntologyOSDK` 增加查询和解析方法，类型放在 ontology `types.ts`，继续由 `index.ts` 统一导出。OSDK 已拥有 store 与 canonical 校验流程，复用它比新增 `ProjectionService` 接口更少，也避免调用方绕过版本门控。

替代方案是直接在 `CanonicalOntologyStore` 增加业务过滤；放弃该方案，因为 store 应保持文件持久化职责，不负责 ontology 语义校验。

### 2. 查询输入使用显式可选过滤字段

查询必须包含 `projectId`、`ontologyId`、`ontologyVersion`；execution identity、kind 和 revision 作为精确匹配过滤器。调用方未提供的字段不参与过滤。字符串比较保持大小写敏感，不按名称、相似度或 latest ontology 猜测。

替代方案是只接收 `contextInstanceId`；放弃该方案，因为审计和故障定位仍需按 run/work item/attempt 查询，强迫调用方先全量读取会复制过滤逻辑。

### 3. latest 以日志顺序处理

全量读取后单次扫描，以 projection `id` 保留更高 revision；revision 相同则后写覆盖。最后按被选记录的原日志位置排序。这与 append-only JSONL 语义一致，且无需新索引。

替代方案是按 `createdAt` 决胜；放弃该方案，因为时间戳可能重复或受时钟偏差影响，日志顺序才是持久化事实。

### 4. Resolver 只解析 canonical facts

resolver 先执行同一 ontology/project 校验，再验证 projection context，随后对每个 fact reference 检查 canonical concept/fact type 归属，并在已接纳 facts 中做全字段精确匹配。任一失败返回 `CanonicalValidationIssue[]`，不返回部分 facts。decision/source 继续作为引用透传，因为本 Epic 当前没有对应正文事实源。

替代方案是返回能找到的部分结果并附 warning；放弃该方案，因为下游可能把不完整上下文当作可执行输入。

### 5. 当前数据量使用顺序扫描

复用 `readProjections()` 与 `readFacts()`。只有 profiling 证明 JSONL 扫描不满足现有性能目标时，才在后续 Task 引入可重建索引。

## 数据所有权与边界

- canonical ontology 与 facts 仍由 ONT store/OSDK 所有。
- projection 是可重建引用视图，不成为 facts 或 runtime 状态的第二事实源。
- 实施写入范围限于 `packages/core/src/lib/features/ontology/types.ts`、`ontology-osdk.ts` 和对应测试；Story/OpenSpec 文档由 Proposal owner 维护。
- core 不依赖 Web、Desktop、collaboration-runtime、memory-core 或 `ontology-data-store` 私有实现，符合 `AGENTS.md` 单向依赖。

## 并发、恢复与安全

- 查询等待 store 当前进程内同文件 append queue，继承现有不读取半次本进程写入的行为。
- 本 Task 不声称解决跨进程 writer 协调或恢复；遇到末尾截断行沿用 store 现有容错，非末尾损坏继续报错。
- `projectId` 路径校验复用 store；ontology/version 与 fact references 精确匹配，失败不泄露其他项目数据。

## Risks / Trade-offs

- [顺序扫描随日志增长变慢] → 保持实现最小并用定向性能样例记录基线；达到可测瓶颈后再增加可重建索引。
- [调用方误以为 resolver 完成授权] → API/文档明确它只验证语义引用，授权仍由调用边界负责。
- [decision 无正文解析] → 保留引用并 fail closed 于 facts；待 decision 事实源有公共 API 后另立 Proposal。

## Migration Plan

1. 以新增 DTO、结果类型和 OSDK 方法发布，不改现有调用方。
2. 运行 core type-check、ontology 定向测试、lint 和架构边界检查。
3. 下游在自己的 Story 中逐步采用；回滚删除新增 API 与测试，不处理持久化数据。
