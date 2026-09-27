# 测试文档 - Story 9.42

**Story:** 多 Agent 任务与解决方案执行契约对齐  
**版本:** 2.0  
**最后更新:** 2026-07-28

## 测试目标

验证多 Agent runtime 只能消费 P2.8 发布的 approved、versioned、hash-verified `SolutionExecutionContract`，不会执行 Workflow，并将真实 verifier 结果登记为 `pi-tasks` evidence。

## 测试策略

| 层级 | 范围 |
|------|------|
| 单元测试 | contract consumer、binding、状态映射、幂等和 verifier |
| 集成测试 | contract load、Run、Evidence Bridge、HITL |
| UI/IPC | 版本展示、非法契约、design gap、聚合进度 |
| 回归测试 | Solution Design、Supervisor DAG、Worker、Blackboard、Task Runtime |
| 脚本化验收 | 发布方案到多 Agent Task 完成全链路 |

核心契约和状态映射覆盖率不低于 80%，关键集成点全部覆盖。

## 单元测试

### TC-U1 Contract consumer

- approved P2.8 contract 可被读取和校验。
- 缺字段、hash 不一致、revoked 或不支持的 schemaVersion 被拒绝。

### TC-U2 精确版本

- 请求 v1.0 只返回 v1.0。
- 不允许 latest 隐式替换。
- active run 保存 frozen contract ref/hash。

### TC-U3 Binding

- Task/Step/Run binding 必须携带 solution/version/contract/hash/revision。
- WorkItem 必须有 designNodeId。
- 旧 revision 和错误 hash 的事件被拒绝。

### TC-U4 状态隔离

- WorkItem completed 不完成父 Step。
- Run completed 不完成父 Task。
- 只有 Evidence Gate 和 `task_complete` 可以完成。

### TC-U5 Evidence 幂等

- 相同 task/step/run/workItem/contractHash/evidenceHash 只登记一次。
- 新 solution version 的 evidence 不写入旧 run。

### TC-U6 Verifier

- 无 verifier、占位 verifier 和 failed verifier 均不能生成 passed evidence。
- contract 指定 verifier 通过后产生完整 provenance。

## 集成测试

### TC-I1 已发布契约到运行

1. 使用 P2.8 已发布 approved contract fixture。
2. 从指定版本启动多 Agent 正式任务。
3. 断言 runtime 使用 exact version/hash。
4. 断言 WorkItems 来自 frozen contract topology。

### TC-I2 拒绝未审批和篡改

- draft/revoked solution 不能启动。
- contract hash 不一致不能启动。
- 前台显示可操作原因和返回设计入口。

### TC-I3 禁止运行时 Workflow

- runtime API 不提供 execute/generate/edit/select workflow。
- 运行时发现新依赖时不创建临时拓扑节点。
- 产生 design gap 并阻塞父 Task。

### TC-I4 契约 DAG

- 并行、依赖和聚合与 frozen contract 完全一致。
- runtime 不把 WorkItems 转为 `pi-tasks` ordered steps。
- contract 外 Agent/Skill 调用被拒绝。

### TC-I5 Evidence Bridge

- Worker 生成 artifact。
- contract verifier 执行真实检查。
- evidence 登记 artifact ref、hash、method、result ref 和 contractHash。
- Step gate 通过后才推进。

### TC-I6 Verifier 失败

- verifier 失败按 contract policy revision/block。
- 父 Step 保持未完成。
- 不存在默认通过。

### TC-I7 版本隔离

- 1.0 run 进行中发布 1.1。
- 1.0 run 继续使用 frozen 1.0。
- 新 run 可绑定 1.1。
- active run 不热更新。

### TC-I8 HITL

- 在 contract 声明安全点报告 blocker。
- 父 Task waiting_user。
- 用户答复进入原父协作 Session。
- 恢复使用相同 contract snapshot。

### TC-I9 Reload/Resume

- 部分 WorkItem 完成后重启。
- 恢复原 solution version/hash 和未完成 WorkItems。
- 已确认 evidence 不重复登记。

### TC-I10 取消与迟到事件

- 取消父 Task 后停止 Run/Worker。
- 迟到 completed/evidence 被丢弃。
- Task 不回退状态。

## UI 与 IPC

### TC-UI1 设计与运行边界

- Workflow 编辑只出现在解决方案设计。
- collaboration runtime 只显示 solution version、Run、WorkItems 和 evidence。
- Story 9.41 任务卡片不出现多 Agent/Workflow 选项。

### TC-UI2 Design gap

- 显示缺失节点、契约或 verifier。
- 提供返回解决方案设计入口。
- 不提供运行时自动修复 Workflow。

### TC-UI3 性能

- 大量 WorkItem progress 节流。
- artifact 正文不通过 IPC。
- 主窗体保持可交互。

## 回归测试

必须覆盖：

- P2.8 contract public port 兼容测试。
- collaboration Supervisor DAG、Worker、Verifier、HITL 和 Snapshot。
- Story 9.41 task/chat 互斥与 `pi-tasks` Evidence Gate。
- Windows/macOS 打包后的 contract/adapter 模块 smoke。

基础命令：

```bash
pnpm lint
pnpm --filter @originos/core test
pnpm --filter @originos/web test
pnpm --filter @originos/desktop test
```

不存在的 package script 必须在验证 Goal 中记录替代命令。

## 自动化测试验证 Goal

```text
目标：通过 Story 9.42 testing.md 中定义的测试 case，验证已发布 SolutionExecutionContract 的版本/hash 门控、多 Agent WorkItem、Verifier、Evidence Bridge、HITL、取消和恢复符合验收标准，并证明 runtime 不执行 Workflow。
```

Goal 输出必须包含测试命令、AC/TC evidence、人工验证步骤和剩余风险。

## 2026-09-22 T1 核心验收证据

- `pnpm exec vitest run --config vitest.config.ts src/modules/collaboration-runtime/facade/__tests__/contract-execution.test.ts`：3/3 通过，覆盖 approved 精确绑定、contractId/hash 门控、撤销拒绝、契约内 WorkItem DAG、frozen snapshot 恢复和 pause/resume/cancel。
- `pnpm exec tsc -p tsconfig.json --noEmit`：通过。
- `pnpm lint:boundaries`：907 个生产文件，0 条诊断。
- Worker 执行、Verifier、Evidence Bridge、HITL、Attempt/lease fencing 和故障注入仍未实施，不满足完整 testing Goal。

## 退出标准

- runtime 无 Workflow 执行、生成、编辑或自动选择入口。
- 新 run 全部绑定 approved frozen contract。
- 不存在默认 verifier 通过。
- 不存在第二套用户 Task 状态。
- Evidence、版本隔离、HITL 和恢复测试通过。
- lint、core 回归和 package smoke 通过。

## 2026-09-24 Core 验证证据

- `pnpm --filter @originos/core exec vitest run src/modules/collaboration-runtime/facade/__tests__/contract-execution.test.ts src/lib/integrations/pi-agent/task-runtime/__tests__/coordinator.test.ts`：2 个文件、27 项通过。
- `pnpm --filter @originos/core exec tsc -p tsconfig.json --noEmit`：通过。
- `pnpm lint:boundaries`：扫描 912 个生产文件，0 条诊断；`node scripts/check-architecture-boundaries.cjs --self-test`：43 个导入用例 × 2 个 CWD 通过。
- 已覆盖 TC-U1–U6 的契约、精确版本、binding、状态隔离、Evidence 幂等和 Verifier fail-closed 核心路径；已覆盖 TC-I1、I2、I4、I6、I7、I9、I10 的 Core ledger 部分。
- 已验证 `createAgentTaskEvidenceSink()` 经受控 `task_evidence` 命令提交 Evidence；TC-I5 的真实 Worker 产物和 Verifier、TC-I8 HITL、完整 Agent Worker 及 Windows/macOS package smoke 尚未执行，不能据此标记 Story 完成。

## 变更历史

| 日期 | 变更 |
|------|------|
| 2026-07-28 | 创建初版 |
| 2026-07-28 | 增加设计时 Workflow 与运行时执行契约边界测试 |
| 2026-07-28 | 移除契约发布测试，改为消费 P2.8 已发布契约 |

## 2026-09-14：项目语义执行规划补充

以下全部待执行，使用真实持久化与进程故障注入。

| ID | 场景 | 预期 |
|---|---|---|
| SX01 | 同Agent执行两个客户任务 | 对象/输入/输出/attempt隔离 |
| SX02 | 依赖completed但事实缺失或状态不符 | 下游阻塞，不调用Worker |
| SX03 | 过期读集/并发写/旧epoch输出 | 明确拒绝，不覆盖合法结果 |
| SX04 | 意图/Action/接纳/Evidence边界强退 | 对账恢复，无重复事实或Evidence |
| SX05 | 审批/暂停/取消时退出 | 原审批保留，暂停不自动执行，取消不复活 |
| SX06 | 外部副作用回执未知不可查询 | 待核对，不自动重发 |
| SX07 | 事实提交后Evidence前崩溃 | 只补Evidence，不重做Action |
| SX08 | 契约撤销/hash错误/快照损坏 | 明确阻塞，不降级latest |
| SX09 | 必须最新的输入在执行中更新 | 拒绝过期输出并要求重新核验 |


完整依赖、状态所有权及验收场景见[主线规划](../../epic-ONT/project-semantic-execution-plan.md)。
