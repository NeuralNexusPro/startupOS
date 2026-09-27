# Tasks

## 1. Core 项目本体入口（串行）

- [ ] 1.1 `ONT-ENTRY-T1-A`（依赖：Proposal 已批准；角色：Core 本体入口 subagent；写入：`packages/core/src/lib/features/project/` 的公共 DTO、entry service、exports 和测试）实现新项目 canonical ontology 初始化、精确 ontologyRef 读取与 legacy migration-required 状态；复用 ontology public API，不直接读写 legacy 源文件。验证：新项目成功、校验失败不产生部分事实、legacy 未迁移零写入、已迁移精确版本读取的 Core 测试及 `tsc`。

- [ ] 1.2 `ONT-ENTRY-T1-B`（串行；依赖：1.1；角色：Core 项目生命周期 subagent；写入：`packages/core/src/lib/features/services/`、project Agent context 公共适配与测试）让项目初始化和 Agent 启动通过 1.1 的公共入口获取 canonical context，移除启动时 `business-model.json` 主读取逻辑；旧项目只返回明确迁移状态。验证：新项目 Agent context、legacy 状态、迁移后项目和无自动写入回归测试。

## 2. 交互入口替换（可并行）

- [ ] 2.1 `ONT-ENTRY-T1-C`（可与 2.2 并行；依赖：1.2；角色：Web 本体 UI subagent；写入：`packages/web/src/app/api/` 薄 routes、`packages/web/src/components/interview/` 与 `packages/web/src/components/os/workspace/` 及测试）将访谈完成、本体/数据编辑器加载改为 Core canonical 入口，删除 mount 自动 `business-model.json` 同步；legacy 项目展示迁移状态。验证：Web route/组件测试覆盖 canonical、legacy、迁移后、无自动写入与错误脱敏。

- [ ] 2.2 `ONT-ENTRY-T1-D`（可与 2.1 并行；依赖：1.2；角色：Desktop 项目本体 adapter subagent；写入：`packages/desktop/src/main/services/`、IPC/preload 必要适配与测试）将 Desktop 项目服务和 Agent project service 改为 Core canonical 入口，保留显式 legacy migration command；删除自动 sync 写入。验证：IPC/service 测试覆盖 canonical、legacy migration-required、迁移后和 Web/Desktop 业务状态对等。

## 3. 集成验收（串行）

- [ ] 3.1 `ONT-ENTRY-T1-E`（串行；依赖：2.1、2.2；角色：Proposal integration owner；写入：Proposal evidence、任务记录和 Story 文档）逐个审查并合并 Task 分支，运行 Core/Web/Desktop 定向回归、`pnpm lint`、`pnpm lint:boundaries`、架构 self-test、Core/Web typecheck、`git diff --check` 与 OpenSpec strict validation；记录旧测试基线和未验证项。

- [ ] 3.2 `ONT-ENTRY-T1-F`（串行；依赖：3.1；角色：Proposal integration owner；写入：Story/Epic/Proposal 状态与本地 Git refs）更新验收证据和实际完成状态，合并 Proposal 至本地 `0.4.x`，保留 worktree 现场；远端推送、发布、打包和清理等待用户后续指示。
