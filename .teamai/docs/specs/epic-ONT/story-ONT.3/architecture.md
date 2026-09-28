# ONT.3 架构

实现位于 `packages/core/src/lib/features/ontology/`，通过该 feature 的 `index.ts` 暴露公共 API。纯转换负责校验、映射与只读投影；迁移协调器只依赖 Node `fs/path`、`getDataRoot()` 和 `CanonicalOntologyStore`。

源文件必须位于注入 data root 内。canonical DataFile 与 migrations JSONL 继续由 store 持有，备份位于 `data/ontology/backups/{projectId}/`。Web/Desktop 不参与本 Task，实现符合 core 单向依赖边界。

回滚使用完成记录中的 DataFile `updatedAt` 做并发保护。本 Task 不宣称跨文件事务；进程在写快照后、完成审计前退出时需人工核对。
