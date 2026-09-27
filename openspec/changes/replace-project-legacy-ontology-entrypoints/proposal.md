# Proposal

## Why

项目创建、访谈、项目 Agent 启动和本体编辑器仍把 `business-model.json` 及旧 `OntologyModel` 当作主输入；而方案、任务与运行时已以 canonical ontology 为事实源。这使同一项目存在两条语义入口和自动同步写入，容易产生版本漂移与双写。

来源：`docs/specs/epic-ONT/README.md`；epic-id：ONT；story-id：ONT.3/ONT.8；task-id：ONT-ENTRY-T1；owner：Codex。

## What Changes

- 新项目访谈确认后直接创建经校验的 canonical ontology，且项目元数据保存其精确 ID 与版本。
- 项目 Agent 的启动上下文、方案入口与项目本体编辑器改由 canonical ontology 公共 API 读取；缺失 canonical ontology 时明确显示迁移入口或新项目状态。
- 旧项目保留显式 ONT.3 dry-run/迁移、备份、审计与只读兼容投影；不在读取、启动、页面加载或升级时自动迁移或同步写入。
- **BREAKING**：新项目不再生成或更新 `output/business-model.json`；旧的自动同步 routes/services 改为只读兼容入口，随后删除无调用方的旧写入路径。

非目标：不修改 canonical ontology schema、OSDK facts/actions、已发布方案契约或协同运行时；不迁移用户已有项目，也不删除其旧文件。

## Capabilities

### New Capabilities

- `project-canonical-ontology-entrypoints`：项目创建、访谈、Agent 启动和编辑器通过同一 canonical ontology 入口读取和写入，新旧项目按显式迁移边界分流。

### Modified Capabilities

无。既有 `legacy-ontology-migration` 的显式迁移与只读兼容要求保持不变。

## Impact

影响 `packages/core` 的项目初始化/ontology 公共服务、`packages/web` 的访谈和本体数据入口、`packages/desktop` 的项目与 ontology 服务及其 IPC 适配；需要相应的 Core/Web/Desktop 集成测试与项目文档。数据写入继续使用本地 DataFile JSON，canonical store 仍是唯一事实源。上线为本地 `0.4.x` 集成；回滚仅撤回本 Proposal 代码，保留 canonical 快照、旧项目文件和迁移审计。依赖 ONT.1–ONT.3 的 store、validator 和显式迁移公共 API。
