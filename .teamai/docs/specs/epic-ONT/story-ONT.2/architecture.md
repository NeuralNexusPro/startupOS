# ONT.2 架构

实现位于 `packages/core/src/lib/features/ontology/`，仅依赖 Node `fs/path`、core `getDataRoot()` 和同 feature 公共类型。路径固定在 `{dataRoot}/ontology/`；Web/Desktop 只能通过后续 adapter 调用。

快照使用同目录临时文件后 rename；JSONL 使用单实例按文件 Promise queue。该队列不提供跨进程保证，后续 adapter 必须选择唯一写入宿主。符合 AGENTS.md 的本地 JSON、公共出口和单向依赖规则。
