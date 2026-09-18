## Why

canonical ontology 已有公共类型和存储，但目前没有统一的引用、状态、权限与版本校验；下游只能各自判断或直接执行。ONT4-T1 需要建立纯函数验证门，使 ONT5、ONT6、P2 和多 Agent runtime 能获得一致、结构化的拒绝结果。

追溯信息：`epic-id: ONT`，`story-id: ONT.4`，`task-id: ONT4-T1`，`owner: Architecture / Core`，来源：`docs/specs/epic-ONT/story-ONT.4/`。

## What Changes

- 新增 canonical ontology 结构与交叉引用校验，覆盖稳定 ID 唯一性、层级引用、状态、转换、FactType、Rule、Action、Event 和 Projection。
- 新增 Action Gate，校验 ontology ID/version、Action/Concept 绑定、当前业务状态和所需权限。
- 所有失败返回现有 `CanonicalValidationResult` / `CanonicalValidationIssue`，包含稳定错误码和字段路径。
- 从 ontology feature 公共入口导出校验 API，并补齐正反例测试。

非目标：不执行 Rule expression，不读取或写入 Facts，不提交 Action，不做 UI/IPC 接线，不替换旧 ontology-data-store 校验器。

## Capabilities

### New Capabilities

- `canonical-ontology-validation`: 定义 canonical ontology 引用完整性与 Action Gate 的结构化校验行为。

### Modified Capabilities

无。

## Impact

- Packages：仅 `packages/core/src/lib/features/ontology/`。
- Public APIs：新增纯函数 `validateCanonicalOntology`、`validateCanonicalAction` 及最小 Action Gate 输入类型。
- Persistence / IPC / packaging：无变化，无写盘行为。
- Dependencies：依赖 ONT1-T1 公共类型；不依赖 Web、Desktop、collaboration-runtime 或 ontology-data-store 私有实现。
- 上线：下游后续显式接入；本 Task 不改变现有调用路径。
- 回滚：删除新增 validator、测试和公共导出即可，无数据迁移。
