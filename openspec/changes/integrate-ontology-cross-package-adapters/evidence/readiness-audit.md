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

## 2026-09-22 前置推进后状态更新

重新审计后，4 个前置门均具备 ONT8 所需的公共边界，结论从 **Blocked** 调整为
**Ready**。P2.8、9.42、9.43 仍有产品级缺口，但这些缺口不属于 ONT8 的
跨包 readiness 门禁：

| 前置能力 | 当前状态 | 更新证据 | 剩余缺口 |
|---|---|---|---|
| P2.8 Solution Execution Contract | Ready | 公共契约、confirmed 编译门控、原子持久化、禁止覆盖、独立撤销和精确读取已合入 `dev`；9/9 定向测试通过，满足 ONT8 对不可变 contract 精确读取的 readiness 门禁 | Story 级 UI/E2E 与 80% 覆盖率仍待后续验收，不阻断 ONT8 |
| 9.42 Task/Run/WorkItem 对齐 | Ready | approved contract 精确绑定、frozen Run snapshot、契约内 WorkItem DAG、pause/resume/cancel 持久恢复已实现；3/3 定向测试通过，满足 ONT8 对 Run/WorkItem 绑定与恢复的 readiness 门禁 | Worker 执行、Verifier、Evidence Bridge 等产品能力仍待 Story 9.42 后续验收，不阻断 ONT8 |
| 9.43 项目任务看板 | Ready | `ProjectTaskBoardService` 公共投影/控制边界、项目隔离、requestId 幂等、revision 冲突、Run/WorkItem 联动已实现；4/4 定向测试通过，满足 ONT8 对同一 Task projection 查询与控制的 readiness 门禁 | 真实 pi-tasks source、Web UI 和 E2E 仍待 Story 9.43 后续验收，不阻断 ONT8 |
| 受控 pi-tasks public adapter | Ready | ADR-010 已接受受控 Runtime patch、`@originos/pi-tasks@0.2.0-originos.1` 与 `task-runtime` 公共边界；`implement-agent-session-task-runtime` 已完成 5.2 验证并归档，Adapter 33/33、A-02 contract 13/13、Core/Desktop/Web 定向集成回归通过 | Windows x64、macOS x64/arm64 package evidence 仍待平台包验证 |

ONT8-T1-B 现在可以开始。上述产品级剩余项仍需在各自 Story 中完成，不得在
ONT8 中伪报为 Evidence 或 Task completion 能力。
