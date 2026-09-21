# ONT.4 架构

实现位于 `packages/core/src/lib/features/ontology/`，只依赖同 feature 公共类型，通过 `index.ts` 导出。Validator 对输入建立临时 Set/Map 后线性扫描，不访问文件系统或其他 feature。

Action Gate 先运行静态 ontology 校验；静态失败立即返回。静态通过后按 ontology identity/version、Action/Concept、状态和精确权限集合顺序校验。Rule 仅验证 ID 引用，不解释 `expression`。

符合 AGENTS.md 的 core 单向依赖和公共 API 规则；Web/Desktop/P2/runtime 后续只通过该公共入口消费。
