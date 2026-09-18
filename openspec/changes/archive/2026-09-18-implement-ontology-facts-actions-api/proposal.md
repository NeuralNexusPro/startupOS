# Proposal

## Why

ONT.2 已提供事实与操作日志，ONT.4 已提供 Action Gate，但调用方仍需自行拼接查询、校验、幂等和审计流程，容易绕过版本与权限门控。ONT5-T1 需要提供唯一的 OSDK 公共边界，让运行时可以安全查询类型化事实并提交无外部副作用的 Action 结果。

## What Changes

- 新增 `CanonicalOntologyOSDK`，通过 ontology feature 公共入口提供类型化 facts 查询与 Action 提交。
- facts 查询校验项目、本体身份、版本、概念与 FactType，并支持按稳定引用过滤及按 `factId` 获取最新修订。
- Action 提交复用 ONT.4 Gate，校验输入事实、输出 FactType、乐观修订和权限；以 `operationId` 写入 intent、facts 与终态回执。
- 重复 `operationId` 返回既有终态回执；未完成 intent 可依据已落盘事实恢复，避免重复追加。
- 回执保存结构化审计 metadata；带未实现 Rule expression 的 Action 明确拒绝。
- 补齐 ONT.5 Story 六文件、Epic 状态和自动化验证证据。

非目标：执行任意 Rule expression、调用外部系统、更新业务对象快照、Web API、Desktop IPC、Context Projection 查询、数据库或新依赖。

## Capabilities

### New Capabilities

- `ontology-facts-actions-api`: 定义类型化事实查询、Action 提交、幂等恢复、版本/修订门控和审计回执。

### Modified Capabilities

无。

## Impact

- **追溯：** epic-id `ONT`；story-id `ONT.5`；task-id `ONT5-T1`；owner `Architecture / Core`；来源 `docs/specs/epic-ONT/story-ONT.5/`。
- **代码与公共 API：** `packages/core/src/lib/features/ontology/`；新增公共请求、结果和 OSDK 类，不改变既有 Store 与 Validator 调用契约。
- **持久化：** 复用 `{dataRoot}/ontology/{projectId}-facts.jsonl` 与 `operations.jsonl`；不新增数据文件。
- **依赖：** ONT2-T1、ONT4-T1；仅依赖同 feature 公共类型/Store/Validator 与 Node 标准能力。
- **上线：** 以新增 API 方式发布，下游按需接入。
- **回滚：** 移除新增 API 与导出；append-only 历史保持可读，无需数据迁移。
