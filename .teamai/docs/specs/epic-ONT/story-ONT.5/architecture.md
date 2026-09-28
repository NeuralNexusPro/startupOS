# ONT.5 架构

实现位于 `packages/core/src/lib/features/ontology/ontology-osdk.ts`，组合同 feature 的 `CanonicalOntologyStore` 与 `validateCanonicalAction`，并从 ontology `index.ts` 公开导出。OSDK 不依赖 Web、Desktop、collaboration-runtime、memory-core 或其他 feature 私有实现。

ontology snapshot 是类型与版本事实源；facts JSONL 是已接纳事实源；operations JSONL 记录 intent 与 accepted 回执。提交顺序为 gate → intent → 缺失 facts → accepted。相同 operationId 使用请求指纹检测冲突，并在单实例内串行。

Rule expression、外部副作用和 instance 状态变更不属于本闭环。该边界符合 AGENTS.md 的本地文件、core 单向依赖与公共 API 规则。
