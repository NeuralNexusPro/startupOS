# ONT.6 架构

实现位于 `packages/core/src/lib/features/ontology/contract-validator.ts`，复用同 feature 的公共类型和 ONT.4 Validator，并从 `index.ts` 导出。新增 flow DTO 只表达 node、edge 与 external inputs，不拥有 P2 方案或 runtime 状态。

匹配使用完整 ontology/version/concept/factType 引用；校验通过临时 Map/Set 线性扫描完成，不访问文件系统。模块不依赖 Web、Desktop、P2、collaboration-runtime、memory-core 或其他 feature 私有实现，符合 AGENTS.md 单向依赖规则。
