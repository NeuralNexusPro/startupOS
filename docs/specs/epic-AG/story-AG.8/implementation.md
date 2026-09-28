# 实施计划 - Story AG.8

**Story:** 包边界治理 — 消灭跨包相对路径穿透
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## Task 划分

每个 Task 一对一创建 OpenSpec Proposal；Task 之间串行（T2 的迁移机制依赖 T1 的 spike 结论）。

### AG.8-T1 — lint 规则 + 启动关键文件 spike（Proposal 1）

**交付物：**

1. `.eslintrc.cjs` `import/no-restricted-paths` zones 新增 3 条规则（desktop / web / perception-plugins → core/src 相对导入拦截），**warning 级起步**。
2. `scripts/check-architecture-boundaries.cjs` selfTest 新增正反例：
   - invalid：`from '../../../../core/src/...'`、side-effect `import '../../../core/src/...'`、`import type ... from '...core/src/...'`
   - valid：`@originos/core/lib/paths` 等包名说明符
3. Spike 迁移 3 个含违规的启动关键文件（2026-09-28 复核：`lib/paths.ts`、`local-agent-bridge.ts` 无跨包导入，仅作核实记录）：
   - `packages/desktop/src/main/setup-data-root.ts`（1 处 from）
   - `packages/desktop/src/main/main.ts`（3 处 from，含值导入）
   - `packages/desktop/src/main/agent-worker-runtime-deps.ts`（21 处 side-effect import，需验证 emit 语义不变）
4. 产物解析结论固化到 [architecture.md](./architecture.md) C-1/C-2：tsc 是否将说明符重写为产物内相对路径；否则按 F1/F2 决策并留证。

**验收：** TC-2（自测）、TC-3（desktop build）、TC-4（打包冒烟）、warning 基线留档。

### AG.8-T2 — services 批量迁移 + error 升级（Proposal 2，依赖 T1）

**交付物：**

1. `packages/desktop/src/main/services/` 26 个文件批量迁移（约 99 处 from 形态 + 动态 import：`collaboration-service.ts`、`channel-runtime-service.ts`）。
2. 测试文件同型导入清理（desktop 测试 24 处 + web 测试 2 处）。
3. zones 规则 warning → error，更新 AGENTS.md「依赖验证」段落状态。
4. 基线 grep 清零（TC-1）、双端编译（TC-3）、完整打包冒烟（TC-4）、IPC 回归（TC-5）、测试基线（TC-6）。

---

## 基线口径（统一，2026-09-28）

| 形态 | 数量 | 位置 |
|------|------|------|
| `from` 形态（非测试） | 123 处 / 30 文件 | 全部在 desktop（services 26 文件 + main 3 文件 + setup-data-root） |
| side-effect import（非测试） | 21 处 | `agent-worker-runtime-deps.ts` |
| 动态 import / typeof import（非测试） | 数处 | `collaboration-service.ts`、`channel-runtime-service.ts` |
| 测试文件 `from` 形态 | 26 处 | desktop 24 + web 2（scheduler test） |

> 注：Story 早先记录的「web 非测试 2 处」实为测试文件导入，已在本计划中修正口径。

---

## 回滚策略

- 每个 Task 单独 PR，单 revert 可回滚。
- zones 规则 warning 级不影响存量通过状态，revert 无副作用。
- 迁移为纯说明符改写，不涉及数据/配置迁移。
