# 实施文档 - Story 9.42

**Story:** 多 Agent 任务与解决方案执行契约对齐  
**版本:** 2.0  
**最后更新:** 2026-07-28

## 实施目标

让多 Agent runtime 绑定并实例化 Story P2.8 发布的不可变执行契约，将真实 verifier 结果登记为 `pi-tasks` evidence；禁止运行时执行、生成或修改 Workflow。

## 前置条件

- [ ] Story 9.41 的 `pi-tasks` adapter、Evidence Gate 和 Task Runtime 可用。
- [ ] Story P2.8 已提供稳定 `SolutionExecutionContract` 公共类型和读取端口。
- [ ] Story 9.42 测试用例已评审。

## 实施步骤

### 1. 对接 P2.8 公共契约

- [x] 依赖 P2.8 导出的 `SolutionExecutionContract` 公共类型。
- [x] 通过 `SolutionExecutionContractPort` 按 solutionId/version 精确读取。
- [x] 校验 approved 状态和 contractHash。
- [x] 不访问 P2.8 编译器、发布器、设计 UI 或 legacy migration。

### 2. Contract Port

- [ ] 实现 load/verify 接口。
- [ ] 校验 approved、版本、hash、Agent/Skill、权限和预算。
- [ ] 错误使用结构化分类并反馈设计缺口。
- [ ] 禁止 runtime 调用 LLM 生成替代 contract 或执行 Workflow。

### 3. Task/Step 绑定

- [x] 多 Agent Task 启动要求 solutionId/version/contractId/hash。
- [x] 创建 `SolutionTaskBinding`。
- [ ] 将 binding 传播到 Run、WorkItem、event、snapshot 和 evidence。
- [x] active run 使用 frozen contract snapshot。

### 4. WorkItem 实例化

- [x] 根据 contract topology 创建 WorkItems。
- [x] 每个 WorkItem 必须关联 designNodeId、Agent、Skill、依赖和 I/O refs。
- [x] runtime 不创建契约外协作节点。
- [ ] 保留并行、依赖、有限重试和 HITL。

### 5. 修复 Verifier

- [ ] 移除生产路径默认 `passed: true`。
- [ ] 按 contract verification policy 执行真实 verifier。
- [ ] 保存 method、artifact refs、result ref、hash 和 checkedAt。
- [ ] 无 verifier、失败或占位结果不得登记 passed evidence。

### 6. Evidence Bridge

- [ ] 将 verifier 通过结果转换为 evidence candidate。
- [ ] 通过 TaskEvidenceSink 写入 `pi-tasks`。
- [ ] 实现 contractHash/evidenceHash 幂等。
- [ ] 只有 Step gate 通过才能推进 Step。
- [ ] 只有 `task_complete` 能完成父 Task。

### 7. Design Gap 和 HITL

- [ ] 运行时发现契约缺失时产生 design gap，不热改拓扑。
- [ ] 设计声明的 HITL 返回父协作 Session。
- [ ] 新方案版本只用于后续新 run。
- [ ] Task 取消后拒绝迟到事件。

### 8. Snapshot/UI

- [ ] 展示 solutionVersion、contract status、Run 和 WorkItem。
- [ ] 不提供生成/编辑 Workflow 或运行时模式切换。
- [ ] design gap 提供返回解决方案设计入口。
- [ ] 高频 progress 节流，artifact 使用引用。

### 9. 回归与验证 Goal

- [ ] 使用 P2.8 发布契约 fixture 运行 version/hash/consumer 测试。
- [ ] 运行 collaboration DAG、Worker、Verifier、HITL 回归。
- [ ] 运行 pi-tasks Evidence Bridge 集成测试。
- [ ] 创建自动化测试验证 Goal，目标为“通过 Story 9.42 testing.md 中定义的测试 case”。
- [ ] 输出自动化 evidence、人工步骤和剩余风险。

## 主要改动范围

- P2.8 导出的 solution contract 公共类型和读取端口
- `packages/core/src/modules/collaboration-runtime/`
- Agent Task coordinator 与 `pi-tasks` adapter
- collaboration UI 的运行状态适配

不得修改 `.next`、`dist-electron` 或 `node_modules`。

## 兼容策略

- legacy solution 由 P2.8 显式迁移后才能启动新 run。
- 旧 `executionMode` 保留为设计元数据，不再触发 runtime 策略选择。
- 旧 collaboration run 只读恢复，不写入新 evidence。
- 运行中的旧 solutionVersion 不自动升级。

## 审查要点

- runtime 是否仍生成、编辑或自动选择 Workflow。
- 是否允许无 approved contract 启动。
- 是否按 latest 偷偷替换 frozen version。
- 是否存在默认 verifier 通过。
- 是否把 WorkItem completed 当成 Task completed。
- 是否 runtime 直接依赖 solution UI 或 `pi-tasks` 私有实现。
- 是否重复登记 evidence 或接受旧 revision。

## 非目标

- 不实现 Story 9.41 的 Agent/RoleAgent 任务入口。
- 不在 runtime 建设 Workflow 编辑器、生成器或动态编排脚本。
- 不定义、编译、发布或迁移 SolutionExecutionContract。
- 不新增用户可编辑运行时 DAG。
- 不允许 active run 热更新 solution contract。

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 创建初版 |
| 2026-07-28 | Workflow 迁移到解决方案设计，runtime 改为执行契约实例化 |
| 2026-07-28 | 契约发布职责迁移至 P2.8，9.42 仅保留 runtime consumer |

## 2026-09-14：项目语义执行规划补充

- [ ] 942-T1：消费P28-T1、ONT5/7和9.41公开端口，实施语义绑定、WorkItem/Attempt隔离与就绪门控。
- [ ] 942-T2：前者完成后实施操作意图/回执、Evidence幂等、lease fencing、checkpoint/replay与故障注入。
- [ ] 旧运行只读或显式校验迁移，不能直接写新Evidence。
- [ ] 每Task独立Proposal和隔离工作区；恢复验收先于看板正式交付。


完整依赖、状态所有权及验收场景见[主线规划](../../epic-ONT/project-semantic-execution-plan.md)。
