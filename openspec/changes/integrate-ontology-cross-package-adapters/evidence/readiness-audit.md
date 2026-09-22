# ONT8-T1-A Readiness Audit

**审计日期：** 2026-09-22  
**结论：** **Blocked — 不得开始应用源码实施**

## 结果

| 前置能力 | 当前状态 | 证据 | ONT8 门禁 |
|---|---|---|---|
| ONT.1–ONT.7 | Ready | Epic 状态表与 ONT.7 Story 均为 Done；core query/resolver 已合入 `dev` | 通过 |
| P2.8 Solution Execution Contract | Not ready | 当前 `dev` 无 `docs/specs/epic-P2/story-P2.8/` 与 solution execution contract 实现；候选分支 `agent/agent/arch-98-contract` 仅有公共契约纯函数，Story 仍缺原子持久化、UI 发布状态与自动化回归 | 阻断 |
| 9.42 Task/Run/WorkItem 对齐 | Not ready | `docs/specs/epic-9/story-9.42/README.md` 为 Planning，未实施公共契约实例化、恢复与 Evidence 幂等路径 | 阻断 |
| 9.43 项目任务看板 | Not ready | 当前 `dev` 缺少 `docs/specs/epic-9/story-9.43/` 六文件；无项目任务投影/命令公共边界 | 阻断 |
| 受控 pi-tasks public adapter | Partially ready | `packages/pi-tasks` 与 `validate-pi-tasks-runtime-boundary` 已在 `dev`，但 active change 为 10/14；剩余 Windows/macOS package module-resolution、Agent regression、9.41 verification goal 与 dev integration | 阻断 |

## 审计依据

- ONT.1–ONT.7：`docs/specs/epic-ONT/README.md` Story 表与 `docs/specs/epic-ONT/story-ONT.7/README.md`。
- P2.8：当前 `dev` 文件树未包含 Story P2.8 与 `packages/core/src/lib/features/solution/execution-contract.ts`；候选分支中的实现不等于基线 readiness。
- 9.42/9.43：当前 `dev` Story 状态与文件树。
- pi-tasks：`openspec/changes/validate-pi-tasks-runtime-boundary/tasks.md` 未完成项 3.3、5.1、5.2、6.2。
- OpenSpec：`openspec validate integrate-ontology-cross-package-adapters --strict` 通过。

## 决定

按照 Proposal 任务 1.1 的 fail-closed 门禁，本轮不修改 Web/Desktop/Core 应用源码。下一步必须先完成 P2.8、9.42、9.43 与 `validate-pi-tasks-runtime-boundary` 的公共边界，再重启 ONT8-T1-B 及后续实施。
