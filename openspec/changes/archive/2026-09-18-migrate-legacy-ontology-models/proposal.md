## Why

当前项目同时存在旧 `Ontology`、访谈 `OntologyModel` 和多种 `business-model.json`，Web/Desktop 还各自复制转换逻辑。ONT3-T1 需要把旧项目显式迁移到 canonical ontology，并保留可预览、可备份、可回滚和只读兼容能力，避免新旧格式继续形成多个写入事实源。

追溯信息：`epic-id: ONT`，`story-id: ONT.3`，`task-id: ONT3-T1`，`owner: Architecture / Core`，来源：`docs/specs/epic-ONT/story-ONT.3/`。

## What Changes

- 在 `packages/core/src/lib/features/ontology/` 提供旧 `Ontology`、访谈 `OntologyModel`、`business-model.json` 到 canonical ontology 的确定性转换。
- 提供不写磁盘的 dry-run 预览和结构化诊断。
- 显式迁移时保留源文件备份、拒绝覆盖已有 canonical ontology，并记录迁移结果。
- 提供迁移回滚，恢复迁移前状态且不修改旧源文件。
- 提供 canonical ontology 到旧 `Ontology` / `OntologyModel` 的只读兼容投影；投影结果不作为写入源。
- 补齐 ONT.3 Story 六文件和旧项目样例验证。

非目标：不自动扫描或静默迁移项目，不修改 Web/Desktop 接线，不删除旧文件，不引入数据库、图数据库或新依赖。

## Capabilities

### New Capabilities

- `legacy-ontology-migration`: 定义旧模型 dry-run、备份迁移、回滚和只读兼容投影行为。

### Modified Capabilities

- `canonical-ontology-store`: 增加迁移所需的安全存在性检查和删除新建快照能力，且不改变现有读写语义。
- `canonical-ontology-schema`: 迁移记录增加明确的 `rolled_back` 终态，避免用通用完成状态伪装回滚。

## Impact

- Packages：`packages/core`。
- Public APIs：ontology feature 新增迁移与兼容投影函数；canonical store 增加最小恢复操作。
- Persistence：继续使用 `data/ontology/` 下的 DataFile JSON 和 migrations JSONL；备份放在同目录，源文件保持不变。
- Dependencies：依赖 ONT1-T1 canonical schema 与 ONT2-T1 canonical store；无新运行时依赖。
- IPC / packaging：本 Task 不接线，不影响平台打包。
- 上线：先由调用方显式 dry-run，再执行迁移；不在读取路径自动触发。
- 回滚：只允许回滚由本次迁移新建的 canonical 快照，删除该快照并保留备份、源文件和审计记录。
