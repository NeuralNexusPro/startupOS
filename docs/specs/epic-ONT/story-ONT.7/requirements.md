# ONT.7 需求

## ONT7-T1 功能需求

- FR1：定义 execution/context identity，完整绑定 task 与 attempt。
- FR2：定义 decision reference、context snapshot、projection record、checkpoint reference。
- FR3：复用 ONT.1 的 source、ontology、concept 与 fact reference。
- FR4：snapshot/projection 只保存引用，不能成为事实或运行状态的第二写入源。
- FR5：公共协议从 ontology feature 入口导出，不新增依赖。

## ONT7-T2 功能需求

- FR6：公共 OSDK 接受完整 `CanonicalContextProjectionRecord`，校验通过后追加到既有 `projections.jsonl`。
- FR7：消费者必须按 `projectId + contextInstanceId + attemptId` 查询，可用 `kind` 和精确 `revision` 继续过滤；结果保持 JSONL 追加顺序。
- FR8：resolver 只按完整 `CanonicalFactReference`（ontology/version/concept/factType/factId/factVersion）解析 ONT 自有事实；decision/source 继续保留引用。
- FR9：同一 project 内，相同 projection `id` 和相同规范化记录的重试幂等返回既有记录；同 id 不同记录以 `PROJECTION_CONFLICT` 拒绝。
- FR10：append 在任何写入前校验 project 一致性、当前 ontology id/version、fact/decision 引用绑定、fact 存在性、重复 fact 引用和非负安全整数 revision，并返回结构化 `CanonicalValidationIssue`。

## 验收标准

1. 同一 Agent 的两个 work item 具有不同 context identity。
2. 快照能够定位原 contract hash、ontology version 与 fact version。
3. 检查点能够暴露 attempt/lease epoch 不一致。
4. 旧调用方无需修改，运行数据不发生变化。
5. 合法 projection append 后可按 context/attempt/kind/revision 精确查询，日期字段正确恢复。
6. project 不一致、ontology/version、引用或 revision 非法时被结构化拒绝且 `projections.jsonl` 零写入；不安全的 project 路径标识继续由 store 以 `TypeError` 拒绝。
7. resolver 按 projection 中的 factRefs 顺序精确返回被引用的历史 fact version；缺失引用聚合为结构化失败，不生成替代值、不修改 projection 或 fact。
8. query 不因当前 ontology 升版而隐藏或自动升级历史 projection。

## 非目标

ONT7-T1 不实现 append/query API、JSONL 存储、恢复协调、权限门控与 UI。

ONT7-T2 不增加数据库、索引、新存储格式、调度、自动恢复、lease 获取/续租、decision/source 仓库、后台压缩、跨进程锁、UI 或 Web/Desktop adapter，也不改造 collaboration-runtime 或 memory-core。

## 边界条件

- ONT 将 context/attempt ID 视为 runtime 提供的非空不透明标识，只负责精确过滤；活跃 attempt、跨记录 context identity、checkpoint/leaseEpoch 新鲜度和恢复许可由 runtime 在调用前门控。
- query 是历史读取，不要求匹配当前 ontology；resolver 仍按 projection 携带的精确版本解析。
- revision 只要求非负安全整数并做精确过滤，不作为全局序列，也不禁止相同 revision 下存在不同 kind/record。
- decision ref 只校验与 context 的 ontology id/version 一致；没有 decision/source 权威仓库，因此不验证其存在性，也不解析 decision/source。
- 幂等比较复用 OSDK 的 `stableValue` 规则：Date 转 ISO、对象键排序、忽略值为 `undefined` 的对象字段、数组保持顺序；比较完整 projection 记录（包括 `createdAt`）。
- MVP 通过独立的 OSDK projection tail 保证单个实例内完整“read/dedupe/append”串行；出现多写进程需求时再引入跨进程协调。
