# Design

## Context

见 `proposal.md` 的问题说明。当前自然语言协作路径由 Supervisor 模型创建 Blackboard TaskItem、通过 `AgentSpawner` 派发 Worker，并依赖模型继续调用 verifier 工具；项目契约执行路径则已经具备父 Pi Task、`CollaborationExecutionStore`、WorkItem attempt、租约、verifier、outcome 与 evidence gate。两条路径同时写任务状态，导致“Worker 已完成但看板失败”、恢复后重复派发、失败原因缺失等问题。

架构规约要求共享业务逻辑位于 `packages/core`，Web/Desktop 仅负责边界与组合；跨 feature 必须走公共 API。现有父 Task 创建依赖项目 feature 的组合根，而 collaboration-runtime 不得反向依赖项目 feature，因此统一必须通过端口注入完成。

## Goals / Non-Goals

**Goals:**

- 新发布的自然语言多 Agent 任务先形成父 Pi Task，再形成正式 Collaboration Run 与 WorkItems。
- Supervisor 负责目标理解、说明和协作编排，执行状态由正式 WorkItem 状态机推进。
- Worker 返回后由运行时确定性执行验收、outcome 和 evidence，不再等待模型“记得”调用下一工具。
- 任务看板只以父 Pi Task 和正式 WorkItem 作为可写事实源，同时保留历史黑板会话只读展示。
- 失败信息可定位到 readiness、worker、verifier、outcome 或 evidence 阶段。

**Non-Goals:**

- 不把并行 WorkItem 转换成 Pi Task 的有序 Step。
- 不静默迁移或改写既有 collaboration session、事件或黑板文件。
- 不改变已发布 SolutionExecutionContract 的冻结语义，也不允许 Supervisor 动态修改契约拓扑。
- 本变更不重做任务看板视觉设计。

## Decisions

### 1. 三层状态所有权固定

- 父 Pi Task：用户目标、验收条件、整体状态和最终完成的唯一事实源。
- Collaboration Run / WorkItem：Agent 执行、attempt、租约、阶段、输入输出和验证结果的唯一事实源。
- Blackboard：Supervisor 对话、共享上下文、事件展示和旧数据兼容，只读投影任务状态。

选择该分层是因为父任务与并行执行单元具有不同生命周期。备选方案是继续让 Blackboard 管理任务，再把结果同步给 Pi Task；这会保留双写与冲突，故不采用。另一个备选是将每个 WorkItem 转为 Pi Step，但会把并行 DAG 错误压平成有序步骤，也不采用。

### 2. 通过注入端口连接 project feature 与 collaboration runtime

在 collaboration-runtime facade 定义面向自然语言协作的执行绑定端口。端口输入包含 projectId、sessionId、自然语言 objective、幂等 requestId 与可选方案选择；输出包含父 Task、父 Step、Run 和 WorkItem 绑定。项目 feature 的生产组合根使用现有 `ApprovedProjectTaskCreationService`、`RuntimeApprovedProjectTaskPort` 和 `CollaborationExecutionStore` 实现该端口。

collaboration engine 只消费端口返回的运行绑定，不导入 project feature 内部实现。Web/Desktop 继续只装配 Core 公共 API，符合 `desktop/web -> core feature/module -> 基础设施` 的依赖方向。

备选方案是在 DAG runner 内直接创建 Agent Session 和任务文件；这会复制项目 feature 的幂等、契约与证据逻辑，故不采用。

### 3. 新运行先解析发布契约，再创建父 Task

自然语言目标必须映射到项目已批准且未撤销的精确 SolutionExecutionContract 与 task template。映射成功后才创建父 Task 与 Run；缺少已发布契约、语义输入或候选目标时返回结构化 design gap，并在对话与看板展示恢复动作。

端口必须以 `projectId + requestId` 幂等。消息重试、窗口重开或进程恢复返回同一绑定，不重复创建任务。

备选方案是没有契约时回退到旧 Blackboard 执行。该行为会继续产生不可验证的新任务，因此新运行失败闭合并提示补齐方案；只有历史会话保持只读兼容。

### 4. Supervisor 只选择可执行 WorkItem，状态机确定性推进

Supervisor 可以解释计划、选择当前 ready WorkItem、向用户请求必要输入或 HITL，但不能创建自由形态的可写任务，也不能直接设置 terminal 状态。执行请求调用 `CollaborationExecutionPort.executeWorkItem()`；该端口已经承担 readiness、Worker、verifier、outcome、evidence 和恢复。

模型完成一轮后，运行时检查当前 Run：若 Worker receipt 已存在且后续阶段未完成，恢复器继续推进剩余阶段；若存在未完成且 ready 的 WorkItem，调度器按契约拓扑继续；只有 HITL、blocked、needs_review 或终态才停止。这样模型输出为空或未调用 verifier 不再形成状态断点。

### 5. 看板按父 Task 合并，正式运行覆盖历史投影

任务看板以父 taskId 为聚合键。存在正式 Collaboration Run 时展示正式 WorkItems、失败阶段、Agent、输入输出与产物；旧 collaboration session 仅在没有正式绑定时作为历史卡片展示。不得把同一目标的两条记录并列为两个可写任务。

### 6. 并发、恢复与安全

沿用正式账本的文件锁、revision CAS、lease epoch、stage claim 与 requestId/payloadHash 幂等。恢复只推进账本中未完成阶段，不依据对话文本猜测完成状态。所有 projectId、runId、workItemId 与文件引用继续经过现有标识校验和项目作用域检查。

## Risks / Trade-offs

- [项目尚无已发布执行契约时，新任务不能直接运行] → 返回可操作的 design gap，并保留用户原始目标，发布契约后用同一 requestId 恢复。
- [历史任务与正式任务同时出现在看板] → 以父 taskId、runId 和 session binding 去重；无正式绑定的旧记录明确标记历史来源。
- [Supervisor 动态分工能力受到冻结契约约束] → 允许在契约候选 Agent 范围内 handoff，不允许越过已批准权限与能力边界。
- [重构横跨 project feature 与 collaboration module] → 端口定义和执行引擎改动限定在 collaboration-runtime；生产实现与组合限定在 project feature；Web 仅做 API 参数和展示适配，避免循环依赖。

## Migration Plan

1. 增加执行绑定端口和项目组合实现，不改变旧文件格式。
2. 新建自然语言任务改走父 Pi Task + 正式 Run；旧 session 仍可读取。
3. Supervisor 执行器切换为正式 WorkItem 调度，Blackboard task mutation 降为历史兼容路径。
4. 看板优先正式运行并去重历史投影。
5. 验证恢复、失败阶段、证据门和历史读取后，停止为新 session 写 Blackboard TaskItem。

回滚时可恢复旧入口调用，但不得删除正式 Run、父 Task 或证据账本。新格式全部由现有 JSON/JSONL 存储承载，无数据库迁移。

## Subagent Implementation Boundaries

若后续采用 subagent 并行实施，写入范围必须互不重叠：一组仅修改 `packages/core/src/modules/collaboration-runtime/` 的端口与执行器；一组仅修改 `packages/core/src/lib/features/project/` 的组合实现；一组仅修改 Web API/展示投影；测试与 OpenSpec 由集成任务统一收口。当前实施由主 Agent 顺序完成，不启用并行写入。
