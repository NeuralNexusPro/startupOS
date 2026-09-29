# core-exports-whitelist 变更：显式白名单与死代码清零（AG.9）

## ADDED Requirements

### Requirement: exports 零通配

`packages/core/package.json` 的 `exports` SHALL 不包含任何通配条目（键含 `*` 的子路径模式）。每个对外可达的子路径 MUST 以显式键列出，且目标 MUST 指向真实存在的源文件（或目录 `index.ts`）。

#### Scenario: 静态断言零通配

- **WHEN** 读取 `packages/core/package.json` 的 `exports` 并过滤键含 `*` 的条目
- **THEN** 结果 SHALL 为空，断言脚本退出码为 0

#### Scenario: 悬空条目禁止

- **WHEN** 任一 exports 显式条目的目标文件在 `packages/core/src/` 下不存在
- **THEN** verify 校验 SHALL 报告该条目并以非零退出

### Requirement: 消费闭集精确命中

web 与 desktop 生产源码及测试中的每一条 `@originos/core/<spec>` 导入说明符 SHALL 在 exports 中精确命中，且命中目标 MUST 通过严格 Node exports 语义（`require.resolve`）解析到存在的文件。

#### Scenario: 严格语义解析

- **WHEN** 对全部消费说明符逐条执行 Node `require.resolve`
- **THEN** 解析失败数 SHALL 为 0（基线 23 条宽松解析存活的说明符在展开后全部获得合法条目）

#### Scenario: 新增导入自动校验

- **WHEN** 开发者新增一条 exports 未覆盖的 `@originos/core/...` 深路径导入并运行 `expand-core-exports.cjs --verify`
- **THEN** verify SHALL 报告该说明符无条目命中并以非零退出，提示运行 expand 或补门面

### Requirement: 门面下限

每个被跨包消费的 core feature SHALL 至少提供两条 exports 条目：`./lib/features/<name>`（指向 feature `index.ts` 门面）与 `./lib/features/<name>/types`（指向该 feature 的类型文件，types.ts 不存在时以 feature 实际类型入口替代并注明）。低热度深路径条目 SHALL 标注过渡态归属（AG.11 继续消化）。

#### Scenario: 门面条目存在

- **WHEN** 对消费说明符所属的每个 feature 目录检查 exports
- **THEN** `<feature>` 门面条目与 `<feature>/types` 条目 SHALL 同时存在

### Requirement: 展开工具门禁

`scripts/expand-core-exports.cjs` SHALL 提供 expand（写入）与 --verify（只读门禁）两模式；expand 按消费闭集机械展开并删除被覆盖的通配条目；verify 断言零通配、消费集精确命中、门面下限、无悬空条目，任一失败非零退出。

#### Scenario: verify 全绿

- **WHEN** exports 展开完成且调用方迁移收敛后运行 `node scripts/expand-core-exports.cjs --verify`
- **THEN** 全部断言 SHALL 通过并输出消费说明符总数与 exports 条目数摘要

### Requirement: 死代码与壳清零

core 内 `.jsx` 无类型副本 SHALL 为 0（11 个：collaboration-runtime/ui 7 个 + lib/features/system 4 个，均以 .tsx 为唯一维护形态）；web 侧 re-export 壳 SHALL 清除（`packages/web/src/lib/features/culture/`、`packages/web/src/lib/features/ontology-data-store/`、`packages/web/src/lib/storage/json-store.ts`），调用方直连 `@originos/core/...`。

#### Scenario: jsx 清零

- **WHEN** 执行 `find packages/core/src -name "*.jsx" | wc -l`
- **THEN** 输出 SHALL 为 0

#### Scenario: 壳目录清零

- **WHEN** 检查 `packages/web/src/lib/features/culture`、`packages/web/src/lib/features/ontology-data-store`、`packages/web/src/lib/storage/json-store.ts`
- **THEN** 三者 SHALL 不存在，且 web 源码中无 `@/lib/features/culture`、`@/lib/features/ontology-data-store`、`@/lib/storage/json-store` 引用

### Requirement: 定位如实化

`packages/core/README.md` SHALL 声明 core 为共享 TypeScript 运行时（业务 features、集成、模块、React hooks、zustand store、模块内 UI），并声明 exports 白名单即公共 API；AGENTS.md 目录结构 core 段落 SHALL 与实际结构一致（不存在的 `components/` 行删除，`lib/hooks/` 注明含 zustand store）。

#### Scenario: README 存在且如实

- **WHEN** 阅读 `packages/core/README.md`
- **THEN** SHALL 包含共享运行时定位声明、依赖层级与「exports 白名单即公共 API」表述

#### Scenario: AGENTS.md 一致

- **WHEN** 对照 AGENTS.md 目录结构中 `packages/core` 树与 `packages/core/src` 实际目录
- **THEN** SHALL 无指向不存在目录的注释行
