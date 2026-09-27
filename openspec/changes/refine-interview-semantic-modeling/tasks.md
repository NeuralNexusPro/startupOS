# 1.7-T1 实施工作包

本 Proposal 唯一对应 Story 1.7-T1。以下编号是内部工作包，不是新增可独立交付的 Story Task。当前均未实施。

## 1. 基线与公共契约

- [x] 1.1 串行；依赖设计批准。编排角色核对 ONT.8 公共入口和现有验证记录，建立 Proposal integration branch 与 subagent Task worktree；范围为本 Proposal 文档。证据：`proposal/refine-interview-semantic-modeling` 位于 `/private/tmp/startupos-proposal-refine-interview-semantic-modeling`，核心 Task 分支 `proposal-task/refine-interview-semantic-modeling-t1-core` 位于 `/private/tmp/startupos-refine-interview-semantic-core`；依赖 `@originos/core/lib/features/ontology` 的 CanonicalConcept、authoring service/store/validator 公共入口。未启动打包，未覆盖已有未提交改动。
- [x] 1.2 串行，依赖 1.1。核心 subagent 在独立 worktree 的 packages/core/src/lib/features/ontology/ 范围新增 semanticKind、分类来源和兼容解析，修正 authoring DTO 的字段往返；验证旧文件兼容、非法输入、权限和引用失败；证据：Task commit `20a8161`，已拣选为 Proposal commit `f52453c`；4 个 ontology 测试文件 31/31 通过。
- [x] 1.3 串行，依赖 1.2。核心 subagent 在同一 ontology 范围完成并发、operationId 和恢复语义；验证 revision 冲突、重复命令、重启及失败无错误覆盖；证据：`authoring-service` 与 `canonical-ontology-store` 语义分类场景覆盖 revision CAS、operationId 重试/重启及快照写入后回执失败恢复；上述 31/31 测试通过。跨进程竞争是 1.8 的额外验收项，未在本 Story 声称完成。

## 2. 访谈与展示

- [x] 2.1 依赖 1.3，与 2.2 可并行。访谈 subagent 在独立 worktree 的 core project/agent feature、project-agent 提示词及 templates/project-interview 范围贯通分类提取、按 ID 修正、仅补关系、逐项回执和 owner 绑定记忆摘要；验证来源隔离、未知信息和记忆失败；证据：Task commit `987a398`，已集成为 `ba248c8`；当前分支核心访谈服务与本体测试合计 33/33 通过。不得修改 ontology 公共导出或 UI。
- [x] 2.2 依赖 1.3，与 2.1 可并行。适配/UI subagent 在独立 worktree 的 Web 访谈/本体组件、投影及 Web/Desktop 薄传输边界实现中文分类、图例、待分类过滤和旧数据预览确认；验证 DTO round-trip、空态/错误态、深浅色和浏览器无 Node 依赖；证据：Task commit `5fb150b`，已集成为 `e84811f`；Web 定向测试 3/3 通过，主工作树 `type-check` 通过。业务逻辑不得写入 route/IPC。

## 3. 集成与验收

- [x] 3.1 串行，依赖 2.1/2.2。集成 subagent 在集成 Task worktree 合并并处理冲突，限本 Story 受影响文件；执行 Story testing.md 验收、受影响包类型检查、pnpm lint、pnpm lint:boundaries、node scripts/check-architecture-boundaries.cjs --self-test；证据：核心/项目 33/33、Web 3/3，`pnpm --filter @originos/web type-check` 通过，`pnpm lint:boundaries` 为 0 诊断，架构自测 43×2 通过，`pnpm lint` 为 0 errors / 3103 既有 warnings，`git diff --check` 通过。
- [x] 3.2 串行，依赖 3.1。文档角色仅更新本 Story 和 Proposal 的测试证据；执行 openspec validate refine-interview-semantic-modeling --strict，并核对 Story verification goal：访谈概念中文分类可纠正、关系不丢、重启一致、旧项目未经确认零写入。任何未验证项明确标未完成；证据：严格校验通过，旧快照纯读取无写回和分类纠正回归已覆盖。未完成项：未单独进行手工 desktop:dev 交互录屏。
- [x] 3.3 串行，依赖 3.2。编排角色核对变更范围并将通过验收的 Task 分支合入 Proposal，再按用户授权合入目标发布线/dev；推送必须另有明确授权。范围仅本 Proposal 提交；证据：Task commits 已先合入 Proposal 分支，再以 `b2826db`、`ba248c8`、`e84811f`、`6562226` 集成到当前 `0.4.x`；未推送远端，未合入 dev。
- [ ] 3.4 串行，依赖 3.3。编排角色清点本任务 worktree，确认成果已保存且无人使用后清理本任务临时工作树；不得清理用户既有 /tmp、其他 worktree 或构建现场；证据：保留/清理清单及可恢复提交。
