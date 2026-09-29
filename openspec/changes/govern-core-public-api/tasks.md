# AG.9 实施工作包

本 Proposal 对应 Story AG.9（无 Task 拆分，A–D 四项作为单一交付单元）。编号是 Proposal 内部工作包，不是新增可独立交付的 Story Task。

## 1. 准备

- [ ] 1.1 串行；依赖设计批准。编排角色确认基线（exports 74/52、唯一说明符 120、严格解析失败 23、jsx 11、web 壳 4 文件 3 组）、建立 Task worktree 与分支。证据：基线命令输出与分支创建记录。

## 2. exports 展开工具与 core 侧（WP-1）

- [ ] 2.1 串行，依赖 1.1。subagent 编写 `scripts/expand-core-exports.cjs`（expand + --verify 两模式，design D1）；先以只读模式输出展开预演报告（120 条说明符 → 目标文件映射 + 新 exports 条目数），人工抽查 10 条映射正确性。证据：预演报告与抽查记录。
- [ ] 2.2 串行，依赖 2.1。subagent 按 design D6 分 4 批执行 exports 展开（features 段 → integrations 段 → modules 段 → shared/hooks/storage 段），每批一个 commit；每批后运行 `--verify`、TC-3（web build + desktop build 0 error）、TC-4（build:app + 打包冒烟 0 MODULE_NOT_FOUND）。证据：4 个 commit 哈希与每批 verify/TC 输出。
- [ ] 2.3 串行，依赖 2.2。subagent 执行 B-批1 门面补齐（新建 `lib/integrations/electron/index.ts`；`ontology`、`agent` 门面补缺失符号），`npx madge --circular` 对照基线无新增环（TC-5）。证据：门面 diff 与 madge 输出。

## 3. 调用方迁移与死代码（WP-2，依赖 2.3 门面就位）

- [ ] 3.1 串行，依赖 2.3。subagent 按热度迁移热点深路径导入到门面（design D3 收口对象清单）；`agent-worker-runtime-deps.ts` 4 处 `/index` side-effect import 与 web memory route 1 处归一为裸形式（D2）；每文件 tsc 快速反馈，全量双端编译 0 error。证据：迁移对账表（迁移前/后说明符清单 diff）与编译输出。
- [ ] 3.2 串行，依赖 3.1。subagent 删除 11 个 .jsx 副本（D5，`git grep "\.jsx'"` 先证零引用）；删除 web 壳 `packages/web/src/lib/features/culture/`（2 文件）、`packages/web/src/lib/features/ontology-data-store/`（1 文件）、`packages/web/src/lib/storage/json-store.ts`；同步更新 `taste-draft/__tests__/route.test.ts`（4 处 `@/lib/features/culture/...` → `@originos/core/...`）、`instances/route.ts:53`、`ontology/[id]/route.ts:158` 动态导入。证据：删除清单 + grep 清零输出。
- [ ] 3.3 串行，依赖 3.2。subagent 重新运行 `expand-core-exports.cjs --verify` 确认调用方迁移后的消费闭集仍全部精确命中（门面收口会减少深路径说明符，白名单条目按 D1 规则相应收敛）。证据：verify 输出。

## 4. 文档与规约（WP-1 范围，串行依赖 3.3）

- [ ] 4.1 串行，依赖 3.3。subagent 新建 `packages/core/README.md`（定位如实化，D4）；修订 AGENTS.md 目录结构 core 段落（删 `components/` 不存在行、hooks 注 zustand store）；确认 exports 白名单形态描述与实际一致。证据：README 与 AGENTS.md diff。
- [ ] 4.2 串行，依赖 4.1。文档角色更新 Story AG.9 文档：testing.md TC-2 阈值修正（design D2，记录修正原因）、implementation.md 实施记录、README 状态流转。证据：Story 文档 diff。

## 5. 集成与验收

- [ ] 5.1 串行，依赖 4.2。编排角色全量回归：TC-1（exports 零通配）、TC-2（修正后口径）、TC-3、TC-4（打包冒烟）、TC-5（madge 基线）、TC-6（jsx 0 + 壳目录不存在）、TC-7（desktop 测试失败集合与基线零 delta：存量 6；web 425 基线）；`openspec validate govern-core-public-api --strict` 通过；Task 分支合并回 Proposal 集成分支。证据：TC 全表输出。
- [ ] 5.2 串行，依赖 5.1。编排角色将 Proposal 分支合入 `refactor/arch-governance`（需用户授权），清理 task worktree；Story AG.9 README 状态更新；docs/changes 记录（全量流水 + 版本归档）。证据：合并哈希与清理清单。
