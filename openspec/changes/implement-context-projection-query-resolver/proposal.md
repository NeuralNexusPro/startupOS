# Proposal

## 追溯信息

- epic-id：ONT
- story-id：ONT.7
- task-id：ONT7-T2
- owner：Architecture / Core
- 来源：`docs/specs/epic-ONT/story-ONT.7/README.md`

## Why

ONT7-T1 已定义上下文投影协议，Canonical Store 也能追加和全量读取 projection JSONL，但调用方仍需自行扫描、筛选并解释引用，容易把不同 run、work item 或 attempt 的上下文混在一起。ONT.8 及其运行时前置能力需要一个最小、确定性的 core 查询与解析边界，才能消费投影而不复制规则。

## What Changes

- 为 context projection 增加类型化查询 DTO，按 project、ontology/version、context identity、kind 和 revision 筛选。
- 在 ontology 公共 OSDK 中提供 projection query，支持稳定顺序和按 `id` 取最新 revision。
- 提供单条 projection resolver，校验 ontology/version、context project、fact references 与 canonical facts 的精确匹配，并返回结构化结果。
- 查询或解析遇到项目、版本、引用不一致时 fail closed，不返回跨上下文或猜测匹配的数据。
- 复用现有 `CanonicalOntologyStore`、validator 和公共类型，不新增存储格式、依赖或跨包适配。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `context-projection-protocol`：从纯 DTO 协议扩展为可按精确 execution identity 查询并解析 canonical fact references 的公共 core API。

## 非目标

- 不实现运行时调度、lease 判定、checkpoint 恢复、权限授权或 UI。
- 不解析 decision 正文，不执行 Action，不写 facts，也不修改 projection JSONL 格式。
- 不接入 Web API、Desktop IPC、P2 或 collaboration-runtime；这些属于各自 Story 与 ONT.8。
- 不增加索引、数据库、GraphRAG 或后台服务；MVP 数据量先复用现有 JSONL 顺序扫描。

## Impact

- packages：`packages/core`
- public APIs：`@originos/core/lib/features/ontology`
- persistence：复用现有 `{projectId}-projections.jsonl` 与 facts JSONL，无迁移
- IPC / platform packaging：无变化
- dependencies：不新增依赖

## 依赖

- ONT7-T1 的 context/projection DTO。
- ONT2-T1 的 `CanonicalOntologyStore` projection/facts JSONL 能力。
- ONT4-T1 与 ONT5-T1 的 canonical validator、facts 查询语义和结构化 issue。

## 上线方案

以向后兼容的新增类型和 OSDK 方法随 core 发布；下游在各自 Story 中显式切换到公共查询 API。

## 回滚方案

删除新增查询/解析 DTO、OSDK 方法和测试即可；本 Task 不迁移或重写任何持久化数据。
