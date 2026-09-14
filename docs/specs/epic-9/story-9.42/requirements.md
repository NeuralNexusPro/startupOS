# 需求文档 - Story 9.42

**Story:** 多 Agent 任务与解决方案执行契约对齐  
**版本:** 2.0  
**最后更新:** 2026-07-28

## 需求来源

Story 9.41 负责 Agent/RoleAgent 当前 Session 的直接正式任务。Story P2.8 负责 Workflow/Team 设计、校验和不可变执行契约发布。多 Agent runtime 只消费 P2.8 的已发布产物，不参与 Workflow 设计或执行。

## 功能需求

### FR1 已发布契约输入

- runtime 输入必须是 P2.8 发布的 approved `SolutionExecutionContract`。
- Workflow 设计稿、视图状态和未发布 manifest 不得进入 runtime。
- runtime 不执行 Workflow 文档；只实例化契约中的冻结节点、依赖和策略。
- 契约缺失时不得由 runtime 编译、推断或补齐。

### FR2 运行时契约绑定

- 多 Agent Task 启动必须绑定 approved solutionId、solutionVersion、executionContractId 和 contractHash。
- runtime 启动前校验状态、版本、hash、Agent/Skill 可用性、权限和数据契约。
- runtime 不执行、生成、选择、修改或解释 Workflow。
- active run 使用 frozen contract snapshot；新方案版本不影响已启动 run。
- 契约无效时进入 blocked/failed，并提示回到解决方案设计修正。

### FR3 唯一用户任务事实源

- objective、ordered steps、acceptance criteria、evidence、blocker 和 completion 由 `pi-tasks` 管理。
- solution execution contract 约束“如何协作执行”，不复制用户 Task 状态。
- collaboration runtime 不得直接完成父 Task。
- Story 9.41 普通 Agent/RoleAgent 任务不绑定多 Agent solution contract。

### FR4 CollaborationRun 与 WorkItem

- runtime 将 frozen execution contract 实例化为 `CollaborationRun` 和 `CollaborationWorkItem`。
- WorkItem 负责分配、依赖、并行、Worker 状态、重试和局部结果。
- WorkItem 关联 parentTaskId、parentStepId、runId、contractId/version/hash。
- WorkItem completed 仅表示局部执行完成，不表示父 Step/Task 完成。
- 并行 WorkItems 由 runtime DAG 管理，不转换为 `pi-tasks` ordered steps。

### FR5 Evidence Bridge

- verifier 根据 execution contract 中声明的验证规则执行。
- 只有可追溯、可复现且 verifier 通过的结果才能登记为父 Step/Criterion evidence。
- evidence 保存 artifact ref、hash、验证方法、结果 ref 和 provenance，不复制大型正文。
- 相同 runId、workItemId 和 evidenceHash 的重放必须幂等。
- Worker 自报、未经验证的 LLM 总结和占位 verifier 不得作为 passed evidence。

### FR6 阻塞、失败与 HITL

- 可恢复 Worker 失败按 contract policy 有限重试。
- 需要用户输入、授权或高风险确认时，在设计声明的安全点暂停。
- HITL 回到父协作 Session，不创建独立 Worker 用户会话。
- verifier 失败按 contract policy 修订、阻塞或失败。
- 运行时发现契约缺口时不得临场改拓扑，应报告 solution design gap。

### FR7 完成门控

- Run completed 只表示已按契约产生候选聚合结果。
- 父 Step 在 required evidence 满足后才能完成。
- 父 Task 只能由 `pi-tasks task_complete` 完成。
- Supervisor、Worker、Verifier 和 Blackboard 均不能绕过 evidence gate。

### FR8 恢复与可观测性

- 事件包含 taskId、stepId、runId、workItemId、solutionVersion、contractHash 和 revision。
- reload/resume 必须加载原 frozen contract snapshot。
- 新版本方案不能自动替换 active run。
- Snapshot 区分父 Task、Run 和 WorkItem。
- 日志不输出完整任务正文、凭据、模型正文或大型 artifact。

## 验收标准

### AC1 绑定已审批方案

**Given** 用户从多 Agent 解决方案入口启动正式任务  
**When** solutionVersion 状态为 approved 且 contractHash 校验通过  
**Then** 创建绑定该契约的 `pi-tasks` Task/Step 和 CollaborationRun  
**And** runtime 使用 frozen contract snapshot。

### AC2 拒绝非法契约

**Given** 契约缺失、未审批、版本不匹配或 hash 被篡改  
**When** 尝试启动 run  
**Then** 系统拒绝执行  
**And** 提示返回解决方案设计修正或重新发布。

### AC3 禁止运行时设计

**Given** Task 正在运行  
**When** 发现拓扑、Agent、Skill 或验证规则不满足需求  
**Then** runtime 不调用模型执行、生成或修改 Workflow  
**And** 记录 design gap 并进入 blocked/failed。

### AC4 契约实例化

**Given** approved execution contract 包含并行和依赖关系  
**When** runtime 创建 WorkItems  
**Then** WorkItem DAG 与 contract 一致  
**And** `pi-tasks` 仍只保留用户业务 Step。

### AC5 验证后登记 evidence

**Given** Worker 已产生 artifact  
**When** contract 指定的 verifier 通过  
**Then** Evidence Bridge 将稳定引用和验证结果登记到父 Step/Criterion  
**And** 重放不会重复登记。

### AC6 拒绝未经验证完成

**Given** Worker 完成但 verifier 未执行、失败或仍为占位  
**When** run 尝试推进父 Step  
**Then** 系统拒绝推进  
**And** 保留可诊断的 verifier/blocker 信息。

### AC7 方案版本隔离

**Given** run 使用 solutionVersion 1.0  
**When** 解决方案设计发布 1.1  
**Then** active run 继续使用 1.0 frozen snapshot  
**And** 只有新 run 可显式绑定 1.1。

### AC8 HITL 与恢复

**Given** WorkItem 在 contract 声明的安全点需要用户输入  
**When** Worker 报告阻塞  
**Then** 父 Task 进入 waiting_user  
**And** 用户答复进入原父协作 Session，恢复时沿用原 contract snapshot。

## 边界与异常

- solution 已删除或撤销：禁止新 run；active run 按撤销策略暂停或终止。
- Agent/Skill 不可用：校验失败，不允许静默替换未审批实现。
- contract 拓扑有环、断链或无 verifier：发布门控应拒绝；运行时再次防御校验。
- 部分 WorkItem 成功：保存候选 artifact，未满足聚合/验证不得完成 Step。
- Task 已取消/完成：拒绝新的 run、WorkItem 和 evidence。
- 同名 artifact：使用 ref、hash 和 provenance 区分。
- 运行时需要新协作分支：报告 design gap，不热改 frozen contract。

## 依赖关系

| 依赖 | 内容 |
|------|------|
| Story 9.41 | `pi-tasks` Task Runtime 与 Evidence Gate |
| Story P2.8 | 发布 approved、versioned、hash-verified 的执行契约和公共读取端口 |
| Story 9.36/9.37 | Supervisor、Worker、Verifier、HITL |

## 非功能需求

- contract 校验和状态提交使用异步 I/O，不阻塞 Electron main。
- Worker progress 节流，父 Task 只在关键边界更新。
- 状态更新幂等，revision/contractHash 拒绝迟到事件。
- 核心契约校验、状态映射和 evidence bridge 覆盖率不低于 80%。
- 不新增数据库、后端框架或跨层反向依赖。

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 创建初版 |
| 2026-07-28 | Workflow 改为解决方案设计产物，runtime 只消费已审批执行契约 |
| 2026-07-28 | 契约编译、校验和发布职责迁移至 Story P2.8 |

## 2026-09-14：项目语义执行规划补充

WorkItem绑定P2.8上下文契约、具体业务对象和输入事实版本；同Agent多任务按run/workItem/attempt隔离。就绪同时满足依赖核验、事实/业务状态、版本与权限门控。候选输出经Verifier和ONT Action接纳后才登记Evidence，Task完成仍由pi-tasks门控。

关闭窗口可继续宿主运行，应用重启允许回到原Task/Run核对后继续。不得重复Action/Evidence、复活已取消任务或自动推进暂停任务。回执不明的外部副作用进入待核对。

完整依赖、状态所有权及验收场景见[主线规划](../../epic-ONT/project-semantic-execution-plan.md)。
