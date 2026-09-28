# 需求文档 - Story AG.9

**Story:** core 包治理 — 公共 API 收缩与定位如实化
**Epic:** AG — 架构治理与围栏对齐
**最后更新:** 2026-09-28

---

## 用户故事

> 作为 OriginOS 维护者，我需要 core 的 exports 从 80+ 条通配符收缩为显式白名单、feature 深层导入收口到 index.ts 门面，这样 core 的内部实现才有被重构的自由，跨包调用方才有稳定契约。

---

## 功能需求

1. **FR-1 exports 收缩**：`packages/core/package.json` 的 `exports` 中，删除全部「任意深度通配」（`./lib/features/*`、`./lib/integrations/*/*`、`./modules/*/*`、`./lib/shared/*`、`./lib/hooks/*` 等），替换为逐项显式子路径。每个 feature 至少保留 `./lib/features/<name>`（指向 index.ts）与 `./lib/features/<name>/types`。
2. **FR-2 门面补齐**：对于 web/desktop 深路径导入涉及、但 index.ts 未导出的符号，补入对应 feature 的 `index.ts` 公共 API（导出符号不变，只加门面），然后调用方改走门面路径。禁止为省事把整个内部文件 re-export 进门面。
3. **FR-3 定位如实化**：AGENTS.md 目录结构章节与新增 `packages/core/README.md` 中，明确 core 包含 React hooks、zustand store、UI 组件（`modules/*/ui`）、Electron IPC 抽象；「core 无 UI 状态」的旧表述一律删除。
4. **FR-4 jsx 副本清理**：删除 `packages/core/src/modules/collaboration-runtime/ui/` 下 7 组 `.jsx` 副本（BlackboardDetail / BlackboardViewer / CollaborationViewer / EventTimeline / MetricsPanel / MultiAgentLauncher / TopologyGraph）。依据：均为初始提交（4ca5f1d）遗留的 strip-types 产物，tsx 版本持续维护、jsx 无类型且全仓无引用方（模块解析 tsx 优先）。
5. **FR-5 web 本地壳目录清理**：`packages/web/src/lib/features/culture/`（2 个 2 行 re-export 壳 + 1 个测试引用）与 `packages/web/src/lib/features/ontology-data-store/store.ts`（1 行 re-export 壳）改直连 core 后删除壳目录；`packages/web/src/app/api/ontology-data/instances/route.ts:53` 的动态导入改走 `@originos/core/...`。

---

## 验收标准

1. - [ ] core `package.json` exports 无 `*` 通配条目（保留确需的、经确认的单文件例外须在 PR 中逐一说明）
2. - [ ] `@originos/core/<deep-path>` 深路径导入数量较基线下降 ≥ 70%，剩余条目全部命中显式 exports 白名单
3. - [ ] `pnpm --filter @originos/web build` 与 `pnpm --filter @originos/desktop build` 0 error
4. - [ ] `find packages/core/src -name "*.jsx"` 输出为 0
5. - [ ] `packages/web/src/lib/features/` 下无 culture、ontology-data-store 目录
6. - [ ] `pnpm lint:boundaries` 通过；`pnpm test` 通过数 ≥ 基线
7. - [ ] AGENTS.md 与 core README 的定位描述一致且与现实相符

---

## 非目标

- 不在本 Story 中把 core 的 React/zustand 代码「下沉回 web」或拆分为独立 UI 包——只如实记录现状，物理拆分留待后续 Epic 决策。
- 不改任何运行逻辑、IPC 协议、数据格式。
- 不处理 `any` 类型预算（归 AG.5 后续任务）。

---

## 风险与回滚

| 风险 | 缓解 |
|------|------|
| exports 收缩后某个运行时（Electron 打包、Next standalone、agent worker）解析失败 | 分四批收缩（features → integrations → modules → shared/hooks），每批后跑 TC-4 打包冒烟；失败即回滚该批 |
| 门面补齐造成循环导入（index.ts 互相引用） | 补门面前跑 madge 循环检查（`npx madge --circular packages/core/src --extensions ts,tsx`）；出现环则该符号保留深路径白名单并记录 |
| jsx 副本实际被某构建链路引用（strip-types 工具复跑） | 删除前 `git grep "\.jsx"` 确认零引用；删除后 TC-4 冒烟 |
| 深路径导入量太大一次性改不完 | FR-2 允许保留「显式列举的白名单」作为过渡态——关键是消灭通配符（机器可审计），深路径收口可分多个 task 持续进行 |

---

## 相关文档

- [AGENTS.md v2.6.3 依赖规约](../../../../AGENTS.md)
- [Story AG.8 — 包边界治理](../story-AG.8/README.md)（前置）
