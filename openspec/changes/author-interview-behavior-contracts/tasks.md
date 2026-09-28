# 1.8-T1 实施工作包

本 Proposal 唯一对应 Story 1.8-T1。以下编号是内部工作包，不是新增可独立交付的 Story Task。当前均未实施。

## 1. 基线与公共契约

- [x] 1.1 串行；依赖设计批准。编排角色核对 ONT.8 公共入口和现有验证记录，建立 Proposal integration branch 与 subagent Task worktree；范围为本 Proposal 文档。证据：`proposal/author-interview-behavior-contracts` 与 `proposal-task/author-interview-behavior-contracts-t1-core` 均从 `e32b598` 建立；公共入口为 `authoring-types.ts`、`authoring-service.ts`、`authoring-transport.ts`、`canonical-ontology-store.ts`、`validator.ts` 及 ontology `index.ts`。根工作区既有未提交打包脚本和本地工具目录未触碰，未启动本地打包。
- [x] 1.2 串行，依赖 1.1。核心 subagent 在独立 worktree 的 packages/core/src/lib/features/ontology/ 范围新增 FactType/Rule/Transition authoring、批次候选快照校验与原子接纳；验证旧文件兼容、非法输入、权限和引用失败；证据：提交 `a448698`（已合入 Proposal），新增非嵌套 `batch`（最多 100 条），在候选快照统一验证后单次 CAS；transport、authoring service、validator 聚焦测试共 29 项通过。
- [x] 1.3 串行，依赖 1.2。核心 subagent 在同一 ontology 范围完成并发、operationId 和恢复语义；验证 revision 冲突、重复命令、重启及失败无错误覆盖；证据：复用 `compareAndSwapAuthoring` 的 operationId/commandHash/receipt 恢复，测试覆盖重复 operationId 冲突、失败批次 revision 不变及既有 store CAS/回执恢复路径。隔离 Proposal worktree 未安装依赖，合入目标发布线后重跑完整验证。

## 2. 访谈与展示

- [x] 2.1 依赖 1.3，与 2.2 可并行。访谈 subagent 在独立 worktree 的 core project/agent feature、project-agent 提示词及 templates/project-interview 范围实现有 revision 的持久草稿、澄清项、可信确认摘要和幂等发布编排；验证来源隔离、未知信息和记忆失败；证据：提交 `e88c296`（已合入 Proposal），草稿保存在 `projects/{project}/interview/behavior-drafts/`，collect/review 工具不具备发布能力，可信确认服务以 hash/revision/operationId 通过 core batch 发布；6 项服务测试、core `tsc --noEmit`、`git diff --check` 通过。
- [x] 2.2 依赖 1.3，与 2.1 可并行。适配/UI subagent 在独立 worktree 的 Web 访谈/本体组件、投影及 Web/Desktop 薄传输边界实现行动草稿审阅、输入输出/状态/约束详情、确认和执行阻塞提示；验证 DTO round-trip、空态/错误态、深浅色和浏览器无 Node 依赖；证据：提交 `456e3f1`（已合入 Proposal）与补充提交 `4af64a1`，行为契约为纯投影，规则在关系/行动/流转卡片下显示，明确“无求值器不可执行”；行动页实际确认按钮通过 Web 薄路由校验 source/draft/revision/hash/operationId 后才调用 core 发布，Agent 工具无发布能力。主工作区 Web type-check 通过。

## 3. 集成与验收

- [x] 3.1 串行，依赖 2.1/2.2。集成 subagent 在集成 Task worktree 合并并处理冲突，限本 Story 受影响文件；执行 Story testing.md 验收、受影响包类型检查、pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test；证据：补充确认闭环后主工作区复跑核心聚焦 Vitest 4 文件 34 项、Web 投影 Vitest 2 项、Core `tsc --noEmit`、Web `type-check`、`lint:boundaries`（966 文件/0 诊断）、架构自检 43×2、`openspec validate --strict` 均通过；此前 `pnpm lint` 为 0 error、3126 条既有 warning。Web 投影与 renderer service 未引入 Node 内建模块。未运行构建或打包。
- [x] 3.2 串行，依赖 3.1。文档角色仅更新本 Story 和 Proposal 的测试证据；执行 openspec validate author-interview-behavior-contracts --strict，并核对 Story verification goal：访谈草稿经确认发布完整契约、失败不留半套定义、重启幂等、规则无执行器仍拒绝执行。证据已补录到 Story 测试计划；尚未进行 `desktop:dev` 人工交互体验，明确保留为发布线合入后的待验证项。
- [x] 3.3 串行，依赖 3.2。编排角色核对变更范围并将通过验收的 Task 分支合入 Proposal，再按用户授权合入目标发布线/dev；推送必须另有明确授权。范围仅本 Proposal 提交；证据：核心、访谈与 UI Task 已合入 `proposal/author-interview-behavior-contracts`，再合入当前 `0.4.x`，合并提交 `6c3721e`。主工作区仅保留既有未提交的 `packages/desktop/scripts/prepare-web-standalone.js` 与本地工具目录；本 Proposal 无未提交改动。未推送远端。
- [ ] 3.4 串行，依赖 3.3。编排角色清点本任务 worktree，确认成果已保存且无人使用后清理本任务临时工作树；不得清理用户既有 /tmp、其他 worktree 或构建现场；证据：保留/清理清单及可恢复提交。
