# Story 9.43：项目任务看板与协同图联动

**状态：** Done（943-T1–T9 已完成；ONT.8 继续承担跨平台打包验收）
**Owner：** Project Runtime / Web  
**日期：** 2026-09-14

作为项目负责人，我希望用任务看板管理由多个Agent执行的工作，并在任务详情和协同图中查看同一份进度、语义上下文、阻塞与产物，以便指派、审核和恢复任务。

前置：9.41公开Task边界，P2.8已发布语义执行契约，9.42运行实例与恢复。核心服务与Web UI分为943-T1和943-T2，各自独立Proposal；跨进程恢复门通过后才正式交付。

验收：仅pi-tasks为Task完成状态事实源；项目隔离；图板一致；非法拖拽被拒绝；可从原任务继续；键盘可操作。完整矩阵见testing.md。无既定日历承诺，按前置验收进入里程碑。

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)  
[主线规划](../../epic-ONT/project-semantic-execution-plan.md) · [Epic 9](../README.md)

2026-09-14：首次规划，不含Linear外部集成、Cycle或工时报表。

## 2026-09-22 实施进度

- 已实现 `ProjectTaskBoardService`：通过注入的 Task source 聚合权威 Task projection，并从 9.42 Run ledger 读取 WorkItem/binding，保持项目隔离、50 条分页、requestId 幂等和 expectedRevision 冲突检查；公开操作仅 pause/resume/retry/cancel，不含 complete。
- 已接入真实项目级 Task Runtime source：从持久会话投影读取、缺失索引时重建、只读关联同项目 Run，并在 Desktop IPC 装配。实时控制仅在对应 Agent Runtime 已恢复时可用；否则明确返回 unavailable。
- 已接入项目工作区“任务”页签：六状态看板、当前页搜索、详情/WorkItem 与受控任务操作均消费 Desktop IPC 的权威投影；Web 环境明确显示不可用。
- 图定位、键盘菜单、拖拽、Agent/优先级数据投影、跨进程恢复联合验收与 E2E 尚未完成；Story 仍为 In Progress。

## 2026-09-25 T3 投影、分页与筛选

- Task Runtime 已提供可选版本化项目元数据；看板从同一 Task/Run/WorkItem 投影展示优先级、语义引用、输入版本、执行 Agent、运行状态、恢复能力和产物引用，旧任务明确显示未设置。
- Web 看板已实现 cursor 加载更多、按 `taskId`/revision 合并、文本/Agent/优先级组合筛选，并在分页时保留筛选和选择。
- B09、B12 已通过 Core 与组件验收；1000 条 fixture 按 50 条分页，WorkItem 完成不会把 active Task 移入已完成列。B01–B08、B10–B11、B13–B14 仍按各自 Task 推进，Story 不关闭。

## 2026-09-25 T4 图板联动

- 看板与协同图共享同一页、详情、revision、筛选和选择状态；切换视图不会重新查询或清空用户上下文。
- 当前页 Task 与选中详情的 WorkItem 形成最小协同图；project/task/revision/run 绑定不一致时拒绝绘制并显示结构化不可用状态。
- B01 已通过组件与架构验收。受控迁移、恢复、任务创建、交接和实时订阅仍在后续 T5–T9 中推进，Story 保持 In Progress。

## 2026-09-25 T5 受控状态转换

- 目标列意图由 Core 解析为唯一公开 capability；revision、lease、requestId 和 Evidence Gate 在权威写入前统一校验，非法、歧义或过期请求零写入拒绝。
- `done` 必须满足 Step/Criterion/Task Evidence 且不存在 unresolved Blocker；WorkItem 完成不能替代 Task 完成门控。
- 拖拽、键盘“移动到”和操作快捷键复用同一服务端 transition；响应前卡片留在原列，拒绝后保留筛选、详情、草稿、选择和焦点，并通过 `aria-live` 返回可操作原因。
- B04、B05、B06、B10 已通过 Core/Web/Desktop 定向验收；T6–T9 和 ONT.8 联合验收仍未完成，Story 不关闭。

## 2026-09-25 T6 原任务恢复

- 项目任务控制在 live runtime 缺失时恢复原 Session、Task 与 Run binding；恢复后重新校验 revision、cursor、epoch、project scope 与 binding。
- paused、waiting_user、cancelled 恢复均不自动执行；cancelled 不复活。旧窗口控制与响应前中断重放通过故障注入，Action/Evidence/Fact 不重复。
- B08 已完成，T7–T9 和 ONT.8 真实平台联合验收仍继续推进，Story 保持 In Progress。

## 2026-09-25 T7–T9 创建、指派与实时订阅

- 看板只能从已发布且未撤销的方案执行契约模板创建 Task/Run；精确语义输入、重复 requestId、撤销和中断恢复均 fail closed 或幂等恢复，B03/B14 已通过。
- 优先级与 WorkItem Agent 交接使用 revision/cursor/lease epoch CAS；交接会失效旧 lease，未授权目标和迟到回执零写入拒绝，B07 已通过。
- Core 在任何 Task/Run/WorkItem/ontology 读取前执行项目授权；Desktop 精确订阅生命周期与 Web host/sequence 缺口恢复已接通，B02/B13 已通过。
- Story 9.43 的 B01–B14 已由 Core/Web/Desktop 自动化矩阵覆盖。Windows/macOS 安装包中的跨包 module resolution 仍由 ONT.8 平台验收负责。
