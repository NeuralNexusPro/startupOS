# 1.8-T1 实施工作包

本 Proposal 唯一对应 Story 1.8-T1。以下编号是内部工作包，不是新增可独立交付的 Story Task。当前均未实施。

## 1. 基线与公共契约

- [x] 1.1 串行；依赖设计批准。编排角色核对 ONT.8 公共入口和现有验证记录，建立 Proposal integration branch 与 subagent Task worktree；范围为本 Proposal 文档。证据：`proposal/author-interview-behavior-contracts` 与 `proposal-task/author-interview-behavior-contracts-t1-core` 均从 `e32b598` 建立；公共入口为 `authoring-types.ts`、`authoring-service.ts`、`authoring-transport.ts`、`canonical-ontology-store.ts`、`validator.ts` 及 ontology `index.ts`。根工作区既有未提交打包脚本和本地工具目录未触碰，未启动本地打包。
- [ ] 1.2 串行，依赖 1.1。核心 subagent 在独立 worktree 的 packages/core/src/lib/features/ontology/ 范围新增 FactType/Rule/Transition authoring、批次候选快照校验与原子接纳；验证旧文件兼容、非法输入、权限和引用失败；证据：单元测试与 DTO 示例。
- [ ] 1.3 串行，依赖 1.2。核心 subagent 在同一 ontology 范围完成并发、operationId 和恢复语义；验证 revision 冲突、重复命令、重启及失败无错误覆盖；证据：集成/故障注入记录，1.8 额外要求双进程竞争和快照写入后回执失败。

## 2. 访谈与展示

- [ ] 2.1 依赖 1.3，与 2.2 可并行。访谈 subagent 在独立 worktree 的 core project/agent feature、project-agent 提示词及 templates/project-interview 范围实现有 revision 的持久草稿、澄清项、可信确认摘要和幂等发布编排；验证来源隔离、未知信息和记忆失败；证据：服务与工具集成测试。不得修改 ontology 公共导出或 UI。
- [ ] 2.2 依赖 1.3，与 2.1 可并行。适配/UI subagent 在独立 worktree 的 Web 访谈/本体组件、投影及 Web/Desktop 薄传输边界实现行动草稿审阅、输入输出/状态/约束详情、确认和执行阻塞提示；验证 DTO round-trip、空态/错误态、深浅色和浏览器无 Node 依赖；证据：组件检查和 desktop:dev 交互记录。业务逻辑不得写入 route/IPC。

## 3. 集成与验收

- [ ] 3.1 串行，依赖 2.1/2.2。集成 subagent 在集成 Task worktree 合并并处理冲突，限本 Story 受影响文件；执行 Story testing.md 验收、受影响包类型检查、pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test；证据：真实命令和失败归因，不用存量问题掩盖新增违规。
- [ ] 3.2 串行，依赖 3.1。文档角色仅更新本 Story 和 Proposal 的测试证据；执行 openspec validate author-interview-behavior-contracts --strict，并核对 Story verification goal：访谈草稿经确认发布完整契约、失败不留半套定义、重启幂等、规则无执行器仍拒绝执行。任何未验证项明确标未完成。
- [ ] 3.3 串行，依赖 3.2。编排角色核对变更范围并将通过验收的 Task 分支合入 Proposal，再按用户授权合入目标发布线/dev；推送必须另有明确授权。范围仅本 Proposal 提交；证据：提交、合并及工作区状态。
- [ ] 3.4 串行，依赖 3.3。编排角色清点本任务 worktree，确认成果已保存且无人使用后清理本任务临时工作树；不得清理用户既有 /tmp、其他 worktree 或构建现场；证据：保留/清理清单及可恢复提交。
