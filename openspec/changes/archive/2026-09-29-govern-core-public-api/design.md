# 设计：core 公共 API 收缩（AG.9）

## Context

### 基线（2026-09-29 实测，3d1d4c8）

**exports 结构**（74 条 / 52 通配 / 22 显式）：

- `./lib/features/*` → `./src/lib/features/*/index.ts`（门面通配，实际是好的）
- 深层通配大量存在：`./lib/features/*/types`、`./lib/features/*/store`、`./lib/features/*/services/*`、`./lib/integrations/*`、`./lib/integrations/*/*`、`./lib/integrations/*/core/*`、`./modules/*`、`./modules/collaboration-runtime/ui/*`（唯一指向 .tsx 的条目）等
- 显式条目 22 条：`./lib/paths`、`./lib/utils`、`./lib/storage`、`./types`、`./lib/features/agent/server` 等

**120 个唯一深路径说明符分布**：

| 段 | 唯一数 | 明细 |
|----|-------|------|
| lib/integrations | 49 | pi-agent 31 / electron 15 / perception 2 / jev 1 |
| lib/features | 43 | ontology-data-store 9 / services 6 / agent 5 / ontology 4 / culture 3 / skills 3 / sandbox 3 / project 3 / solution 2 / 其余各 1 |
| modules | 22 | collaboration-runtime 9 / memory-core 5 / channel-runtime 4 / scheduler 2 / perception-runtime 2 |
| lib/{paths,utils,storage,hooks} | 5 | paths、utils、storage、storage/json-store、hooks/use-workspace |
| types | 1 | `@originos/core/types` |

**严格 Node exports 语义解析实测**（web workspace 下 `require.resolve`）：97/120 可解析，**23 条失败**。失败原因两类：

1. **exports target 指向不存在文件**（webpack/tsc 靠「目标不存在则尝试目录 index」等宽松规则存活）：如 `./modules/*` 目标 `./src/modules/memory-core.ts` 而实际是 `memory-core/index.ts`。
2. **通配 tie-break 选择与文件形态错配**：如 `lib/features/sandbox/app-scanner` 命中 `./lib/features/*` 得到 `app-scanner/index.ts` 目标，但实际是 flat 文件 `app-scanner.ts`。

23 条的消费者全部在 desktop（22 条，集中于 `agent-worker-runtime-deps.ts` 12 条 + 6 个服务文件）或 web 的 `import type`（`pi-agent/server` 2 处，该条目本身显式可解析——失败的 23 条中无 web 运行时消费者）。

**门面现状**：`lib/features/culture/index.ts`、`lib/integrations/pi-agent/index.ts` 等多数 feature 有门面；`lib/integrations/electron/` 无 index.ts（15 个深路径说明符无门面可走）；`lib/features/ontology`、`lib/features/agent` 等门面导出面不全（调用方绕行深路径）。

**热点**（按消费文件数）：`lib/paths` 47、`electron/ipc-protocol` 26、`modules/perception-runtime` 24、`lib/utils` 22、`electron/env` 22、`features/agent/server` 22、`features/project` 20、`features/ontology` 17、`features/skills` 16、`features/agent` 14。

**死代码**：11 个 .jsx（7 组 collaboration-runtime/ui + system/errors 2 + system/performance 2），全部有 .tsx 对应，`git grep "\.jsx'"` 零引用。web 壳：culture 2 个 2 行 re-export 壳（生产消费者已直连 core，仅 2 个测试文件还引用 `@/lib/features/culture/...`）、ontology-data-store/store.ts（1 行壳 + route.ts:53 动态导入）、lib/storage/json-store.ts（1 行壳 + ontology/[id]/route.ts:158 动态导入）。

### Story 文档与实测的差异处理

| 项 | Story 记载 | 实测 | 处理 |
|----|-----------|------|------|
| exports 条目 | 84 / ~40 通配 | 74 / 52 | 以实测为准，Story 不回改（实施文档记录） |
| jsx | 7 组 14 文件 | 11 文件 | Story 漏计 system 4 个，实施覆盖 11 个（Story 的 7 组全包含在内） |
| culture 壳 | 3 文件 | 2 壳 + 1 测试引用 | 按 2 壳处置；测试引用随壳删除更新 |
| json-store 壳 | 未列出 | 存在且同型 | 纳入 FR-5 同批清理（同型同风险） |
| TC-2 阈值 | 降 ≥70% | 见 D2 | 修正阈值口径 |

## Goals / Non-Goals

目标：exports 零通配、120 说明符全显式命中、门面收口热点深路径、定位如实化、jsx/壳清零。

非目标：把全部 120 个深路径一次性迁完（门面收口仅热点，其余保留为显式白名单过渡态，后续 Story/AG.11 持续消化）；core 源码结构调整（AG.10 巨型文件拆分另行处理）；`.teamai` 双文档树（AG.11）。

## Decisions

### D1：expand 语义 = 消费闭集机械展开，而非人工策划白名单

`scripts/expand-core-exports.cjs` 两模式：

- **expand**（写入）：扫描 web/desktop 生产源码（+ 测试）全部 `@originos/core/<spec>` 说明符 → 对每条 spec，删除所有匹配它的通配条目、写入指向真实目标文件的精确条目（解析顺序：显式条目保留原样 → 通配命中后按 Node exports 语义 + 文件系统验证（`.ts` / `.tsx` / 目录 `index.ts`）确定唯一目标）。保留与任何说明符无关的既有显式条目（如 `./lib/features/agent/server`）。
- **--verify**（门禁，只读）：重跑扫描与解析，断言 (a) exports 零通配；(b) 每条消费说明符精确命中且目标文件存在；(c) 每个被消费的 feature 目录存在 `<feature>` 门面条目与 `<feature>/types` 条目（强制下限，FR-1）；(d) exports 中无「指向不存在文件」的悬空条目。任一失败非零退出。

理由：一次性人工策划 120 条目不可审计；消费闭集展开可重复执行、verify 可接入 CI（AG.11 考虑）。`main` 条目与 `./src/index.ts` 不动。

通配删除范围是「匹配至少一条消费说明符的通配」；完全不匹配任何消费说明符的通配直接删除（如 `./lib/features/*/mime`——sandbox/mime 由消费说明符命中后走精确条目）。

### D2：TC-2 阈值修正 + 5 处 `/index` 遗留归一

Story testing.md TC-2 要求「唯一深路径说明符较基线下降 ≥70%」且「每条均能在 exports 白名单中精确命中」。实测基线 120 条中，仅 23 条在严格语义下不可解析、绝大多数是「文件级精确条目」本来就能显式化。**收缩的本质是消灭通配（机器可审计），不是把 120 个深路径全部清零**——FR-2 允许显式白名单作为过渡态。

决策：TC-2 验收改为「(a) 每条消费说明符在 exports 中精确命中且目标存在（verify 模式断言）；(b) 门面收口后唯一深路径说明符较 120 下降 ≥15%（≥18 条，热点 B 批次可达成）」。下降阈值下调的原因：Story 的 70% 假设「大量深路径是冗余变体」，实测 120 条唯一值中变体（同文件多写法）极少，硬砍 70% 会强迫把 ~80 个低热度深路径一次性门面化，超出 Story 3–5 天的合理范围且违背 FR-2 的过渡态设计。

`/index` 后缀 5 处（T1-legacy：`agent-worker-runtime-deps.ts` 4 处 + web memory route 1 处）归一为裸形式：`agent-worker-runtime-deps.ts` 的 4 处 `/index` side-effect import 实测 Node 解析失败（MODULE_NOT_FOUND），靠 F1 exact entries 存活；归一为裸形式后依赖「目录 index 条目」（如 `./lib/features/agent/cognitive/pattern` → `index.ts`）或门面，随 D1 展开自动获得合法条目。

### D3：门面收口范围 = 热点 top 批次 + 强制下限，分两批

- **B-批1（必须）**：门面缺失但深路径成规模的目标——`lib/integrations/electron/index.ts`（新建门面，聚合 env/ipc-protocol/window/workspace-paths 常用符号，services/* 暂不入门面——它们是 IPC 服务注册表，门面化收益低）；`lib/features/ontology`、`lib/features/agent` 门面补缺失符号。对应调用方迁移。
- **B-批2（强制下限）**：FR-1 要求每个被消费 feature 有 `<feature>` + `<feature>/types` 条目——不要求调用方迁移，只要求白名单有条目。低热度深路径（services/*、perception-registry 等 desktop 专用内部件）保留显式条目，在 exports 注释标注「过渡态，AG.11 继续消化」。

收口对象判定：唯一说明符按消费文件数排序，消费文件数 ≥5 的深路径优先门面化（`perception-runtime` 24、`agent/server` 22、`project` 20、`ontology` 17、`skills` 16、`agent` 14、`channel-runtime` 13、`pi-agent/client` 11、`electron/services/misc` 11、`culture/CultureSessionService` 11）；`lib/paths`（47）、`lib/utils`（22）、`electron/ipc-protocol`（26）、`electron/env`（22）本身已是显式条目且是基础设施定位，保留不动。

### D4：定位如实化（C 项）遵循 Story 原文，实测修订

- 新建 `packages/core/README.md`：声明 core = 共享 TS 运行时（业务 features + integrations + modules + React hooks + zustand store + modules 内 UI），列出依赖层级与 exports 白名单即公共 API。
- AGENTS.md 修订：目录结构中 `core/src/components/`（不存在，删除该行）、`core/src/lib/hooks/` 注「含 zustand store」、确认树中 modules 列表与实际一致。版本号不变（文档如实化不构成架构变更，changelog 记录）。

### D5：jsx 与 web 壳删除的引用面先行处理

- jsx 11 个：`git grep` 确认零引用后 `git rm`。system 下 4 个的 index.ts（`errors/index.ts`、`performance/index.ts`）需确认未 re-export jsx（实测 index.ts 均 `export * from './ErrorBoundary'` 指向 tsx，无 jsx 引用）。
- web 壳 3 处 4 文件：culture 2 个（生产消费者已直连 core；`taste-draft/__tests__/route.test.ts` 中 4 处 `@/lib/features/culture/...` 引用改 `@originos/core/...`，其中 1 处动态 import 在 vi.mock 环境中解析，需验证 mock 路径一致性）、ontology-data-store/store.ts（`instances/route.ts:53` 动态导入改 `@originos/core/...`）、json-store.ts（`ontology/[id]/route.ts:158` 动态导入改 `@originos/core/...`）。删除后 TC-6 验证。

### D6：分批 commit 与验证节奏

exports 展开按段分 4 批提交（每批后 TC-3 双端编译 + TC-4 打包冒烟必跑）：

1. `lib/features/*` 段通配（约 21 条通配）→ 展开为 features 段显式条目
2. `lib/integrations/*` 段（约 9 条通配）→ integrations 段
3. `modules/*` 段（约 12 条通配）→ modules 段
4. `lib/{shared,hooks,storage}/*` 段（约 3 条通配）→ 收尾

每批 expand → verify → TC-3 → TC-4；4 批全过后再动门面收口（B 批次）与死代码（D 项），最后统一跑 TC-1~TC-7。

## Risks / Trade-offs

- 展开后 exports 条目数从 74 → 约 130+（AG.8-T2 打包 staging 实测 130 条量级），package.json 变长但机器可审计；trade-off 可接受，显式是本 Story 的目的本身。
- 门面 re-export 可能引入 feature 间循环 → B 批次每步 `npx madge --circular` 对照基线（TC-5），禁止新增环。
- web 测试的 vi.mock 路径与壳删除同步更新，mock key 改 core 说明符后 vitest 模块图需重验（TC-7 web 全量跑）。
- F1 staging 对显式 exports 的兼容性：`rewriteExports` 只改写 `./src/*.ts` 形态目标，目录 index 形态目标（`./src/x/index.ts` → `./dist/src/x/index.js`）需确认正则同样覆盖——`./src/(.+)/index.ts` 匹配 `(.+)` 含 `/`，可行；TC-4 每批兜底。
- MultiAgentLauncher .tsx 特例：web 2 处消费的 `./modules/collaboration-runtime/ui/*` 通配展开后得到指向 `.tsx` 的显式条目（webpack/tsc 均可解析）；desktop 不消费该文件，无 F1 影响。

## Migration Plan

1. 写 expand 脚本 + 基线 verify 快照（只读）。
2. 4 批 exports 展开（D6），每批 TC-3 + TC-4。
3. B 批次门面收口（D3）+ 调用方迁移 + `/index` 归一（D2）。
4. C 项文档、D 项死代码（D5）。
5. 全量 TC-1~TC-7 + strict validation。

Subagent 拆分：WP-1（core exports + expand 脚本 + 门面，packages/core 与 scripts/）与 WP-2（web/desktop 调用方迁移 + 壳删除，packages/web 与 packages/desktop）写入范围零交集；WP-2 的调用方迁移依赖 WP-1 的门面就位，串行衔接（WP-1 先行）。

## Open Questions

无——TC-2 阈值修正（D2）在 Proposal 审查中向用户显式呈现，批准即生效。
