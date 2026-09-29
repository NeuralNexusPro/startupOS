# 设计：desktop 存量说明符迁移与 error 升级（AG.8-T2）

## Context

T1 基线（2026-09-29 实测，refactor/arch-governance @ fd3f42c）：

| 形态 | 数量 | 分布 |
|------|------|------|
| `from` 形态（非测试） | 119 处 / 27 文件 | 全部 `packages/desktop/src/main/services/`（最大单文件 `agent-session-service.ts` 14 处） |
| 动态 import / typeof import（非测试） | 9 处 | `collaboration-service.ts` 2（含 `typeof import` 类型位）、`channel-runtime-service.ts` 6、`perception-plugin-host-service.ts` 1（`typeof import` 嵌于 `Parameters<...>` 类型位） |
| 测试文件 | 26 处 | desktop 24 + web 2（scheduler test） |
| 唯一 core 子路径 | 57 个 | 见 `grep` 清单，全部平铺文件或目录入口 |

T1 spike 结论（已合入，见 Story AG.8 architecture.md C-1/C-2）：tsc 保留说明符字面量；F1 staging（`prepare-core-runtime.js`）按产物真实消费闭集生成 exact exports；`/index` 后缀会 MODULE_NOT_FOUND。

## Goals / Non-Goals

目标：desktop/web 全部存量跨包相对导入归零；拦截规则 warning → error；AGENTS.md「依赖验证」段落状态更新。

非目标：core exports 收缩（AG.9）、跨 feature 私有导入与循环依赖（既有检查边界外）、`.teamai` 双文档树治理（AG.11）。

## Decisions

### D1：types 深路径 → `@originos/core/types` 而非新增 exports 条目

57 个子路径中 5 个是 `types/agent|ontology|perception|project|project-creation`（13 处导入）。核对 core `src/types/index.ts` 重导出：

- `agent`、`perception`、`project`、`project-creation` 均 `export * from './x'` → 改写为 `@originos/core/types` 后全部符号可达，且 `./types` exports 条目已存在。
- `ontology` 走显式 `export type {...}` 清单，`OntologyEntity`/`OntologyRelation` 不在其中（全仓库仅 `types/ontology.ts` 定义）。

决策：**在 `packages/core/src/types/index.ts` 显式清单补 `OntologyEntity`、`OntologyRelation`**（2 个符号加入既有重导出行），desktop 侧统一改 `@originos/core/types`。理由：core exports 通配收缩是 AG.9 方向，为 2 个符号新增 `./types/ontology` 条目与收缩方向相悖；index 补重导出是公共 API 面微扩容、单行改动，且使 `OntologyEntity`/`OntologyRelation` 成为真正的公共 API（desktop 消费本应走此通路）。

备选放弃：desktop 保留 `types/ontology` 深路径 + core exports 新增条目——把本应进 index 的符号钉死在深路径，扩大 AG.9 逆差。

### D2：迁移映射规则（机械，可脚本预演）

```
from '../../../../core/src/<subpath>'      → '@originos/core/<subpath>'   （exports 覆盖时）
from '../../../../../core/src/types/<x>'  → '@originos/core/types'        （types 4 子路径，D1）
import('...core/src/<subpath>')            → import('@originos/core/<subpath>')
typeof import('...') 类型位同上
```

- 前缀深度不同（`../../../../` 与 `../../../../../`）按文件相对深度归一，以「解析到 `packages/core/src/`」为准而非固定层数。
- `types/*` 4 个子路径在映射表显式列出，避免误配。
- 迁移脚本只做正则替换 + 结果 diff 人工复核；每文件替换数与基线清点数对账。

### D3：severity 升级放在迁移之后、同 Proposal 内

- 迁移完成、TC 全绿后才改 `.eslintrc.cjs` `no-restricted-syntax` warn → error 与 checker severity；避免 error 先行阻塞其他并行开发。
- `check-architecture-boundaries.cjs` 的 selfTest 增加 error 级断言用例（正式配置在清零后必须以 error 判定违规）；checker 消息中的「迁移见 Story AG.8」指引更新为「强制（AGENTS.md v2.6.3）」。
- AGENTS.md「跨包相对路径检查」段落同步：规则由 warning 起步改为已升 error（v2.6.4）。

### D4：测试文件随本次迁移（不拆 T3）

26 处测试导入与生产迁移同型同机制，拆分只增加一次验证周期；测试文件不进打包闭集，无 F1 增量。

### D5：动态 import 的运行时验证依赖既有 F1 闭环

`channel-runtime-service.ts` 的 6 处动态 import 与 `collaboration-service.ts` 的懒加载 facade 在打包态经 F1 staging 的 exact exports 解析（T1 的 24 个消费闭集来自静态 grep，动态 import 同样是字面量字符串，会被 `prepare-core-runtime.js` 的扫描捕获——已确认其正则覆盖 `import(` 形态）。

## Risks / Trade-offs

- `export *` 与显式清单的差异导致符号级编译错误 → 每文件迁移后跑 `tsc --noEmit` 快速反馈；全量 `pnpm --filter @originos/desktop build` 兜底。
- 动态 import 改写后 tsc 生成不同的 chunk 布局 → 仅影响产物文件分组，F1 staging 镜像整个 dist，无影响；TC-4 打包冒烟兜底。
- index.ts 补 2 个符号可能与其他包的局部类型名冲突 → `OntologyEntity`/`OntologyRelation` 在 core types 之外无同名导出（已 grep 确认定义唯一）。

## Migration Plan

1. 写映射预演脚本（只读 diff 报告），确认 119+9 处替换逐条对账。
2. 分两个 subagent 工作包并行（写入范围不重叠）：
   - WP-1（core+toolchain）：`types/index.ts` 重导出补充、`.eslintrc.cjs`/checker severity、selfTest 用例、AGENTS.md 状态。
   - WP-2（desktop 迁移）：27 文件 + 9 动态处 + 26 测试处机械替换。
   - WP-2 依赖 WP-1 的 index 重导出（types/ontology 2 处导入），故 WP-1 先行、WP-2 后动；两者写入范围零交集。
3. 集成验证：TC-1（清零）、TC-2（self-test）、TC-3（双端编译）、TC-4（打包冒烟）、TC-6（测试基线）。

## Open Questions

无——机制不确定性已由 T1 spike 全部消除。
