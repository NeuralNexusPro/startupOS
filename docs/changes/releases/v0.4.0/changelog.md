# Changelog - v0.4.0

---

## 2026-10-01 — refactor：AG.10-T5 pi-agent core agent 巨型文件拆分

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/core/agent.ts`（1912→1348）、`core/{agent-internals,agent-completion,agent-factory}.ts`（新建 3 文件）、`docs/specs/epic-AG/story-AG.10/`
**摘要**：Proposal `refactor-agent-core` 实施 OriginOSAgent 主类拆分：EventEmitter + 8 个纯 helper 逐字移入 agent-internals.ts；judge/empty-stop/guard/失败报告 4 个 completion 方法按 D3 ctx 变换移入 agent-completion.ts（4 个可变字段以 getter/setter 闭包绑定主类实例保证写回）；工厂移入 agent-factory.ts 并落地 D4 传参注入（`<T>(params, ctor)` + agent.ts 尾部同名薄包装——madge 8 将 type-only import 计边，type-only 反向引用与 setter 注册两案均实测 13 环超门禁后弃用）。公共符号与消费方导入零变化。TC-1~TC-6 全过（core 失败集与基线逐一相同、store.test 20/20；双端 build 0 error；madge 12 环=基线、core/ 新文件零环；边界扫描 0 诊断；主文件 1348 ≤ 1500，新文件最大 432 ≤ 600）。token 级复核 4 方法/8 helper 逐字一致。subagent 停滞 4 次由主会话接管验证。Story AG.10 完成 5/7。

---

## 2026-09-30 — refactor：AG.10-T4 contract-bound runtime composition 巨型文件拆分

**类型**：refactor
**影响模块**：`packages/core/src/lib/features/project/contract-bound-runtime-composition.ts`（1102→141）、`features/project/composition/{contract-runtime-types,contract-artifact-runtime,contract-execution-adapters,contract-task-session-adapters}.ts`（新建 4 文件）、`docs/specs/epic-AG/story-AG.10/`
**摘要**：Proposal `refactor-contract-runtime-composition` 实施 contract-bound-runtime-composition.ts 纯机械拆分：协议常量与 host/组合类型、artifact 执行运行时（helper + AgentManagerContractRuntime）、Readiness/Verifier/Outcome/HITL 执行端口适配器、Task 会话适配器（approved task 端口/evidence sink/恢复/优先级 mutation）逐字移入 `composition/` 子目录 4 文件；主文件收敛为组合根（`createProjectContractRuntimeComposition` + `projectContractRuntimeHost`）并 re-export 全部 9 个公共符号，调用方 import 零改动。TC-1~TC-6 全过（web 425/425；desktop 182/182；3 个 project 测试 15/15；wiring 2/2 + ipc 23/23；双端 build 0 error；madge 12 环=基线且 0 路径经过 composition/；主文件 141 ≤ 250，新文件最大 351 ≤ 600）。集成复核 token 级一致：组合根 2 函数 + 8 类 + 19 函数 + 2 常量全等（唯一变换为 eslint curly 单语句花括号包裹，AST diff = 0）。偏差 6 处已留痕（深路径 type import 断 madge 回边等）。Story AG.10 完成 4/7。

---

## 2026-09-30 — refactor：AG.10-T3 task-runtime coordinator 巨型文件拆分

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/task-runtime/coordinator.ts`（1142→689）、`task-runtime/coordinator-{types,shared,commands,controls}.ts`（新建 4 文件）、`docs/specs/epic-AG/story-AG.10/`
**摘要**：Proposal `refactor-task-coordinator` 实施 coordinator.ts 纯机械拆分：host/配置类型与错误类/模块级 helper 逐字移入 types/shared，Project metadata/Evidence/Review 命令与 pause/cancel/resume/retry 控制动作按 D3 ctx 变换外移（`this.*` → `ctx.*`，可变字段经 `bumpContinuationGeneration`/`resetRunningPromise` 访问器、`state` 经 getter/setter 保持引用语义），主类保留 host 生命周期、续跑循环编排与状态机/持久化。4 个公共符号 re-export 可导入，desktop 深路径与包内导入零改动。TC-1~TC-6 全过（web 425/425；desktop 182/182；coordinator.test 21/21；双端 build 0 error；madge 12 环=基线；coordinator.ts 689 ≤ 700，新文件最大 328 ≤ 600）。集成复核 token 级逐字一致性：28 个保留方法与 10 个外移函数体全部一致（唯一变换为访问器调用与 helper 重命名）。Story AG.10 完成 3/7。

---

## 2026-09-30 — refactor：AG.10-T2 Pi Agent 客户端 hooks 巨型文件拆分

**类型**：refactor
**影响模块**：`packages/core/src/lib/integrations/pi-agent/client-hooks.ts`（→ `client-hooks/` 7 文件）、`packages/core/package.json`（exports target 切换）、`docs/specs/epic-AG/story-AG.10/`
**摘要**：Proposal `refactor-client-hooks` 实施 client-hooks.ts 纯机械拆分：store/types/api 逐字移入，send/stream 函数体按 D3 规则外移，index.ts 承接全部公共导出，调用方零改动。TC-1~TC-6 全过（web 425/425；desktop 182/182；madge 12 环=基线）。Story AG.10 完成 2/7。

---

## 2026-09-30 — refactor：AG.10-T1 首页 page.tsx 巨型文件拆分（首个 task 完成）

**类型**：refactor
**影响模块**：`packages/web/src/app/page.tsx`（1609 → 108 行）、`packages/web/src/app/home/`（新增 5 文件）、`packages/desktop/src/main/services/perception-plugin-host/__tests__/email-provisioning.test.ts`（遗留 tsc 修复）
**摘要**：Proposal `refactor-home-page-structure` 实施首页 page.tsx 纯机械拆分：page.tsx 收敛为布局门面，展示组件/状态/handler 逐字移入 `app/home/`；导出符号与调用方 import 零改动。TC-1~TC-6 全过（web 425/425；desktop 182/182；双端 build 0 error；madge 12 环=基线；首页冒烟 200/0 error）。Story AG.10 转 In Progress，T2–T7 待实施。

---

## 2026-09-30 — refactor：AG.11 重复与死代码治理（Story AG.11 完成）

**类型**：refactor
**影响模块**：`.teamai/docs`（移出 git）、`.gitignore`、`packages/service/`（删除）、`packages/web/data/`（出库）、`knip.json`、`docs/specs/epic-AG/story-AG.11/`、`AGENTS.md`
**摘要**：Proposal `clean-redundant-docs-and-dead-code` 实施仓库卫生治理：`.teamai/docs` 868 文件移出 git（本地保留，实测零消费方）；`packages/service` 空壳删除；`packages/web/data` 61 文件出库；knip 6.38.0 基线入库（files 121 / exports 80，只记录不接 CI）。TC-1~TC-6 全过，测试基线零 delta。AGENTS.md 升 v2.6.6。

---

## 2026-09-29 — feat：AG.9 core 公共 API 收缩与定位如实化（Story AG.9 完成）

**类型**：feat
**影响模块**：`packages/core/package.json`、`scripts/expand-core-exports.cjs`、`packages/core/src/`、`packages/web/src/`、`packages/desktop/src/`、`packages/core/README.md`、`AGENTS.md`、`docs/specs/epic-AG/story-AG.9/`、`openspec/`（spec `core-exports-whitelist` 新增）
**摘要**：Proposal `govern-core-public-api`（已归档）实施 core 公共 API 收缩：exports 74 条/52 通配 → 132 条显式 / 0 通配（新增 `expand-core-exports.cjs --verify` 门禁）；新建 electron 门面并迁移 electron/culture/pi-agent-task-runtime 热点深路径导入；删除 11 个 jsx 副本与 web 壳 4 文件；`packages/core/README.md` 定位如实化（共享 TS 运行时，exports 白名单即公共 API）。TC-1~TC-7 全过，测试基线零 delta。合并哈希 36d55cc；AGENTS.md 升 v2.6.5（新增 core exports 白名单条款）。


## 2026-09-28 — docs：架构围栏治理与 Epic AG Story 追加（AG.8–AG.11）

**类型**：docs
**影响模块**：`AGENTS.md`（v2.5.8 → v2.6.3）、`CLAUDE.md`（改为指针文件）、`docs/specs/epic-AG/`
**摘要**：架构审视后完成规约围栏治理：确立 AGENTS.md 为单一事实源，CLAUDE.md 变为工具兼容指针；AGENTS.md 补入多 Agent 协作运行时章节（facade/ui 组装豁免取代「不 import 外部模块」声明）、跨包导入必须使用包名说明符条款、协作运行时性能指标、数据根解析规则与实际 data 子目录；技术栈表补入 Monorepo/Electron。新增 4 个治理 Story：AG.8 包边界治理（125 处跨包相对路径 + lint zones）、AG.9 core 公共 API 收缩（exports 通配符 84→显式白名单 + jsx 副本清理）、AG.10 巨型文件拆分（7 文件）、AG.11 重复与死代码嗅探（knip 基线 + 双文档树处置）。

---

## 2026-09-29 — feat：AG.8-T1 跨包说明符边界（lint 拦截 + 启动文件 spike + F1 打包 staging）

**类型**：feat
**影响模块**：`.eslintrc.cjs`、`scripts/check-architecture-boundaries.cjs`、`packages/desktop/src/main/{setup-data-root,main,agent-worker-runtime-deps}.ts`、`packages/desktop/scripts/{prepare-core-runtime,prepare-web-standalone,verify-ontology-runtime}.js`、`packages/desktop/{package.json,electron-builder.yml}`、`docs/specs/epic-AG/story-AG.8/`、`openspec/changes/add-cross-package-specifier-imports/`
**摘要**：AG.8-T1 落地跨包说明符边界（Proposal `add-cross-package-specifier-imports`，已合并 refactor/arch-governance）。拦截机制放弃 `import/no-restricted-paths` zones（pnpm 链接下物理路径判定误报 ~589），改用 `no-restricted-syntax` 5 selector 字面量匹配（warning，零误报），checker 以 error 级镜像，selfTest 43→50；迁移 3 个启动关键文件共 25 处导入为 `@originos/core/...`（tsc 保留说明符字面量，产物解析由新增 Fallback-F1 解决：`prepare-core-runtime.js` staging dist-electron/core 并按 24 个真实消费说明符闭集生成 exact exports，electron-builder 打包为 node_modules/@originos/core，打包产物启动冒烟 0 MODULE_NOT_FOUND）；附带修复 2 个前置既有打包脚本缺陷（prepare-web-standalone hoist 误拒、verify-ontology-runtime 挂起不退出）。存量违规 128 处留待 AG.8-T2 迁移后升 error。

## 2026-09-29 — feat：AG.8-T2 desktop 存量说明符迁移与 error 强制执行（Story AG.8 完成）

**类型**：feat
**影响模块**：`packages/desktop/src/`（27 服务文件 + 测试）、`packages/web/src/`（测试）、`packages/core/src/types/index.ts`、`packages/desktop/vitest.config.ts`、`.eslintrc.cjs`、`scripts/check-architecture-boundaries.cjs`、`AGENTS.md`（v2.6.3 → v2.6.4）、`docs/specs/epic-AG/story-AG.8/`、`openspec/changes/migrate-desktop-core-specifiers/`
**摘要**：AG.8-T2（Proposal `migrate-desktop-core-specifiers`）完成剩余存量迁移：154 处跨包相对导入（119 from + 9 动态/typeof + 26 测试，含 10 处 vi.mock 字面量）全部改为 `@originos/core/...` 包名说明符；types 深路径收敛到 `@originos/core/types`（core types index 显式补 `OntologyEntity`/`OntologyRelation` 重导出）；`no-restricted-syntax` 拦截规则升 error（selfTest 51 例），`lint:boundaries` 966 文件 0 诊断、新增违规非零退出阻断；desktop vitest 补 `@originos/core` resolve.alias 与 web 对齐；F1 打包 staging 自动扩展至 70 个消费说明符（130 条 exports 全部 resolve），打包产物启动冒烟 0 MODULE_NOT_FOUND；测试基线零 delta（web 425/425）。Story AG.8（T1+T2）至此完成，AGENTS.md v2.6.4 标记该条款强制执行。遗留：T1 产物中 5 处 `/index` 形态说明符留待 AG.9 exports 治理统一收敛。
