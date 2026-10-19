# Story P2.10：解决方案后台物化任务

解决方案设计在用户确认后，不再要求当前对话一次性创建全部 Agent 与 Skill 文件。系统创建一个仅供内部运行的后台物化任务，按 Agent、Skill 和最终校验保存断点并恢复失败步骤。

该任务不进入项目任务看板，不属于用户下发给业务 Agent 的项目 Task；前台只展示方案正在生成、完成或失败的轻量状态。

## 验收范围

- 冻结已确认的 `manifest.json`、`agents.json`、`skills.json` 作为任务输入。
- 每个 Agent 和 Skill 都有独立、幂等的物化步骤及输入/输出记录。
- 应用或会话中断后可从未完成步骤继续，已经通过校验的文件不重复生成。
- Skill 创建遵循 `project-skill-creator` 契约，并保证其引用的本体工具资料真实可达。
- 全部产物经过确定性校验后才将方案标记为物化完成。
- 后台任务不投影到项目任务看板、Run 或业务 WorkItem。

## 实施与验证（2026-10-15）

- Core 使用 `solutions/{version}/materialization-task.json` 保存内部任务、步骤、claim、尝试次数、失败原因和产物摘要；confirmed 三文件内容变化后拒绝继续旧任务。
- Web 后台 runner 按 Agent → Skill → 最终验收执行。失败后用同一入口携带 `retryFailed: true` 仅恢复失败步骤。
- 每个 Skill 同时生成 `SKILL.md` 与 `references/ontology-tools.md`，最终验收会比对 canonical contract、Agent 的 Skill 引用及文件摘要。
- 实现未创建或导入 ProjectTask、collaboration Run、WorkItem，因此不会进入统一任务看板。

验证证据：

- Core materialization 单元测试：6 项通过。
- Web runner 与 API 测试：5 项通过。
- `pnpm lint:boundaries`：1008 个生产文件，0 条诊断。
- 架构自测：51 个用例 × 2 个 CWD 通过。
- Core exports：136 条显式导出、0 通配，校验通过。
- `openspec validate materialize-solution-in-background --strict`：通过。
