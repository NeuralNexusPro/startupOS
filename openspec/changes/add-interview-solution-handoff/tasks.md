# Tasks

## 1. 访谈完成判定与收尾引导

- [x] 1.1 `P2.10-T1-C`（可并行；依赖：无；角色：Core Project Agent subagent；写入：`packages/core/src/lib/integrations/pi-agent/project-agent/` 及其测试）补充访谈完成后的自然语言收尾约束，并以目标 prompt 回归测试通过作为完成证据。完成证据：隔离任务提交 `f7985b0`，3 个 suites / 15 项目标测试通过。
- [x] 1.3 `P2.10-T1-G`（串行；依赖：1.1；角色：Core 集成负责人）将 FactType 逐对象覆盖、Action 与 Rule 缺失纳入访谈阶段门禁，向恢复会话注入明确缺口清单，并以部分覆盖场景回归测试作为完成证据。完成证据：实际项目识别 8 个 FactType 缺口，旧 ready 草稿恢复为 collecting；Core 29 项与 Web 15 项目标测试通过。
- [ ] 1.2 `P2.10-T1-W`（可并行；依赖：无；角色：Web 访谈 UI subagent；写入：`packages/web/src/components/interview/` 及其测试）实现 canonical 完成判定、会话尾部完成卡片和解决方案窗口入口，并以完成、未完成、恢复和点击跳转组件测试通过作为完成证据。

## 2. 集成与验证

- [ ] 2.1 `P2.10-T1-I`（串行；依赖：1.1、1.2；角色：Proposal 集成负责人；写入：仅冲突修复、变更文档与验证记录）集成两个任务，运行目标 Core/Web 测试、相关 TypeScript 检查、`pnpm lint:boundaries`、架构检查和 core exports 门禁，以命令输出和 Story 场景逐项验证作为完成证据。
- [ ] 2.2 `P2.10-T1-V`（串行；依赖：2.1；角色：Proposal 集成负责人；写入：`openspec/changes/add-interview-solution-handoff/`）运行 `openspec validate add-interview-solution-handoff --strict`，核对 Story verification goal“完成访谈后可从会话进入当前项目解决方案设计”，记录验证结果，并在集成完成后清理隔离 Task worktree。
