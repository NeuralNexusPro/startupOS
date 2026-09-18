# Proposal

## 追溯信息

- epic-id：ONT
- story-id：ONT.2
- task-id：ONT2-T1
- owner：Architecture / Core
- 来源：`docs/specs/epic-ONT/story-ONT.2/README.md`

## Why

ONT.1/ONT.7 已建立公共语义协议，但 canonical ontology、版本事实和操作回执尚无唯一持久化入口。现有 JsonStore 非原子写，ontology-data-store 使用另一套项目目录，无法承担后续迁移与可恢复提交的事实基础。

## What Changes

- 新增 canonical ontology DataFile JSON store，路径统一为 `{dataRoot}/ontology/{projectId}-ontology.json`。
- 使用同目录临时文件和 rename 原子替换快照，更新时保留 `createdAt`。
- 新增 facts、operations、projections、migrations 四类 append-only JSONL 流。
- 同一 store 实例按文件串行追加；读取时允许忽略崩溃留下的最后一条截断记录，中间损坏明确失败。
- 定义版本事实、操作回执和迁移记录 DTO；Date 在磁盘写为 ISO 字符串，读取恢复为 Date。
- 不迁移旧数据，不实现 Action、validator、跨进程锁或 Web/Desktop adapter。

## Capabilities

### New Capabilities

- `canonical-ontology-store`：提供 canonical ontology 快照与版本事实/操作/投影/迁移 JSONL 的安全文件存储边界。

### Modified Capabilities

无。

## Impact

- packages：`packages/core`
- public API：`@originos/core/lib/features/ontology`
- persistence：新增 `{dataRoot}/ontology/{projectId}-{ontology|facts|operations|projections|migrations}.{json|jsonl}`
- IPC / packaging：无变化
- dependencies：不新增依赖

## 非目标

- 不迁移或删除旧 `ontology-data-store`、旧 ontology JSON 或 `business-model.json`。
- 不提供跨进程并发写保证；Desktop/Web 后续必须通过唯一写入宿主调用。
- 不执行 Action、副作用、权限校验、自动补偿或 runtime 恢复。

## 依赖

- ONT1-T1 canonical schema。
- ONT7-T1 projection record。
- core `getDataRoot()`。

## 上线与回滚

作为新增 API 上线，现有调用方不切换。回滚删除新增 store/types/tests；已生成文件保持可读，不做自动删除。
