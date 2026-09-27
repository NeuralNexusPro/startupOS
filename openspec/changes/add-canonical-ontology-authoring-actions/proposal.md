# Proposal

## Why

项目入口已统一读取 canonical ontology，但本体编辑器的写命令仍返回 `CANONICAL_EDIT_UNAVAILABLE`，用户无法在新事实源上维护概念、属性、关系、状态和 Action。现在需要补齐受版本与并发约束的定义编辑事务，才能形成项目本体的可用闭环。

可追溯信息：epic-id：ONT；story-id：ONT.8；task-id：ONT-AUTHORING-T1；owner：Codex；来源：`docs/specs/epic-ONT/README.md`。

## What Changes

- 在 ontology feature 增加 canonical ontology authoring command 公共 API，支持领域、概念、属性、关系、业务状态和 Action 的创建、更新与删除。
- 每个命令必须携带 ontology ID/version、`expectedRevision`、`operationId` 和调用方权限；提交前统一校验引用、权限、版本与 revision，成功后原子替换 canonical 快照并记录 append-only authoring receipt。
- 相同 `operationId` 的相同请求幂等返回原回执；不同请求复用 ID 或陈旧 revision 零写入拒绝。
- Web API 和 Desktop IPC 仅做参数解析、环境注入和响应映射；本体编辑器恢复 canonical 写入，并在冲突后刷新权威快照。
- legacy ontology 写入口继续保持只读；不恢复 `business-model.json` 或 `ontology-data-store` 双写。

非目标：不修改运行时 facts/actions OSDK 语义，不自动迁移旧项目，不实现实例数据编辑，不新增数据库或后台服务。

## Capabilities

### New Capabilities

- `canonical-ontology-authoring`：为 canonical ontology 定义提供经校验、版本化、幂等且可审计的编辑事务，并由 Web/Desktop 共用。

### Modified Capabilities

- `canonical-ontology-store`：增加 authoring revision 与 append-only authoring receipt 的持久化能力，同时维持快照原子替换。

## Impact

影响 `packages/core/src/lib/features/ontology/` 的公共类型、store 和 authoring service，`packages/core/src/lib/integrations/electron/` 的编辑 bridge，`packages/desktop/src/main/services/ontology-data-service.ts` 的 IPC 写适配，以及 `packages/web` 的薄 API route 和编辑器调用。数据仍位于本地 `data/ontology/`；新增 authoring JSONL 回执，不引入第三方依赖。上线随 `0.4.x` 本地集成；回滚撤回 UI/adapter 与 authoring service，保留 canonical 快照和审计回执，不回退到 legacy 写入。

