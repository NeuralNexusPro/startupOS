# 测试：项目任务看板

**状态：** Done；943-T1–T9 与 B01–B14 自动化验收完成；实际平台安装包验证由 ONT.8 4.3 跟踪；2026-09-25。

| ID | 层级 | Given / When | Then |
|---|---|---|---|
| B01 | Integration | 同一Task从图与看板读取 | task/run/workItem及revision一致 |
| B02 | Integration | 非授权项目ID请求列表/命令 | 拒绝且无数据泄露 |
| B03 | Integration | 重复requestId创建任务 | 只产生一个Task和绑定 |
| B04 | Unit/Integration | 缺证据或仍有Blocker，提交完成 | 门控拒绝，不改状态 |
| B05 | Component | 拖拽被拒绝 | 恢复原列，焦点与草稿保留，显示原因 |
| B06 | Integration | 两客户端对同revision发控制命令 | 后者冲突提示，不覆盖前者 |
| B07 | Integration | 运行中改负责人 | 先交接/失效旧lease，迟到结果拒绝 |
| B08 | E2E | 退出应用后回到原任务点击继续 | 由9.42恢复相同绑定，不重复Action/Evidence |
| B09 | Component | 任务暂停/失败、WorkItem完成但Task未完成 | 卡片展示正确执行徽标，不误入已完成 |
| B10 | Component | 键盘移动/操作任务 | 与鼠标走相同命令门控，焦点可见 |
| B11 | Integration | 索引删除后加载项目 | 从持久任务绑定重建，不复制Task状态 |
| B12 | Performance | 1000任务、多Agent状态更新 | 50条分页、只渲染当前页；按AGENTS交互指标实测 |
| B13 | Component | 同时后台刷新与编辑筛选/表单 | 保持输入；卸载不残留订阅 |
| B14 | E2E | 手动目标无已发布模板或语义输入缺失 | 明确设计/输入缺口，不生成临时执行拓扑 |

## 2026-09-22 T1 核心验收证据

- `pnpm exec vitest run --config vitest.config.ts src/lib/features/project/__tests__/task-board.test.ts`：4/4 通过，覆盖 B01/B06 的 Task/Run/WorkItem 同 revision 聚合、expectedRevision 冲突、requestId 幂等/冲突和项目越界拒绝。
- `pnpm exec tsc -p tsconfig.json --noEmit`：通过。
- `pnpm lint:boundaries`：907 个生产文件，0 条诊断。
- B03/B04/B07/B08/B11/B12/B14 与 Web UI/E2E 仍未执行，不标记 Story 完成。

## 2026-09-24 真实任务源验收证据

- `pnpm --filter @originos/core exec vitest run ...project-task-source.test.ts ...task-board.test.ts ...session-title.test.ts ...agent-manager.test.ts ...contract-execution.test.ts`：26/26 通过，覆盖项目隔离、50 条分页、持久投影重建、不可用降级、Task/Run 关联和公开 Runtime 控制适配。
- `pnpm --filter @originos/core exec tsc -p tsconfig.json --noEmit` 与 `pnpm --filter @originos/desktop exec tsc -p tsconfig.json --noEmit`：通过。
- `pnpm lint:boundaries`：914 个生产文件，0 条诊断；`node scripts/check-architecture-boundaries.cjs --self-test`：43 个导入用例通过。
- `openspec validate implement-project-task-board-source --strict` 与 `git diff --check`：通过。
- B08、B12 及所有 Web UI/E2E 用例仍待执行。

## 2026-09-25 T3 B09/B12 验收证据

- `project-task-source.test.ts` 与 `task-board.test.ts`：2 files / 12 tests 通过。1000 条持久 Task fixture 强制每页最多 50 条，两页读取与索引重建小于 500ms；WorkItem 已完成时 Task 仍保持权威 active 状态。
- Web service/component：2 files / 13 tests 通过。组件证明完成态 WorkItem 徽标仍留在“进行中”Task 列；1000 条 fixture 每次只消费 50 条 cursor 页，未加载页不进入 DOM；筛选、选择和较新 revision 在追加时保留。
- Core、Web、Desktop typecheck 均通过；Web lint 0 errors；边界扫描 919 个生产文件、0 条诊断；架构 self-test 43 个导入用例 × 2 CWD；diff check 与 `openspec validate complete-project-task-board-projection --strict` 通过。
- 详细记录：`openspec/changes/complete-project-task-board-projection/evidence/943-t3-c-acceptance.md`。本次只完成 B09/B12，不替代其余 B01–B14 验收。

## 2026-09-25 T4 B01 验收证据

- Web service/component：2 files / 15 tests 通过，覆盖图板复用同一 taskId/revision/detail、切换后筛选与 WorkItem 选择保持、错误 parentTaskId 不绘制。
- Core、Web、Desktop typecheck 通过；目标 lint 0 errors；边界扫描 938 个生产文件、0 条诊断；架构 self-test、diff check 与 strict validation 通过。
- 详细记录：`openspec/changes/link-project-task-board-collaboration-graph/evidence/943-t4-c-acceptance.md`。

## 2026-09-25 T5 B04/B05/B06/B10 验收证据

- Core：3 files / 39 tests 通过，覆盖 Evidence/Blocker Gate、WorkItem 完成不可替代 Task Evidence、目标 capability 唯一解析、旧 revision/lease 零写入和两个不同目标状态的并发 CAS。
- Web：2 files / 21 tests 通过，覆盖拖拽、键盘移动菜单、操作快捷键共用 transition；拖拽拒绝后原列、筛选、详情、草稿、选择、焦点和 `aria-live` 均保持正确。
- Desktop：1 file / 15 tests 通过，覆盖 transition intent/CAS 字段原样透传、输入拒绝与稳定 Evidence gap 错误。
- Core、Web、Desktop typecheck，`pnpm lint`（0 errors）、边界扫描（940 个生产文件、0 条诊断）、根/包目录架构自测、diff check 和 strict validation 均通过。
- 详细记录：`openspec/changes/add-project-task-board-controlled-transitions/evidence/943-t5-e-acceptance.md`。

## 2026-09-25 T6 B08 恢复验收证据

- Core 恢复与故障注入：4 files / 41 tests 通过。两个全新 Agent manager 恢复同一 Session/Task；paused、waiting_user、cancelled 均不自动 prompt；cancelled 不复活；旧 epoch、revision/cursor 或 Run binding 漂移在 mutation 前拒绝。
- 响应前中断后从新 host 重放，Agent 调用、Evidence 调用、Fact 与 accepted operation 数量均保持稳定；跨包服务分别返回 `PROJECT_TASK_RUNTIME_STALE` 和 `PROJECT_TASK_SOURCE_UNAVAILABLE`，不再吞成通用 internal error。
- Core、Web、Desktop typecheck、Web lint（0 errors）、边界扫描（940/0）、架构 self-test、strict validation 与 diff check 通过。
- 详细记录：`openspec/changes/recover-project-task-board-runtime-on-control/evidence/943-t6-c-acceptance.md`。

## 2026-09-25 T7–T9 B02/B03/B07/B13/B14 验收证据

- Core：22 files / 169 tests 通过，覆盖授权零读取、模板创建幂等/撤销/恢复、并发优先级、未授权交接、旧 lease 迟到回执、项目事件隔离与订阅释放。
- Web：5 files / 53 tests 通过，覆盖 DesignGap、不乐观创建/指派、更高 revision 合并、host/sequence 缺口重读、筛选/草稿/选择/焦点保持和卸载 cleanup。
- Desktop：3 files / 26 tests 通过，覆盖固定 preload channel、可信 sender actor、重复订阅复用、显式退订、权限撤销和窗口销毁 cleanup。
- Core、Web、Desktop typecheck，Web lint（0 errors）、边界扫描、架构 self-test、strict validation 与 diff check 通过。明细见 T7/T8/T9 OpenSpec evidence。

先执行单测/接口测试，再组件测试，最后联通真实Task/Run及Windows/macOS恢复矩阵。故障注入复用主线E08–E11；API成功返回不能代替持久提交证据。测试数据使用临时项目，不操作真实外部IM。
