# Spec Delta

## Purpose

为项目负责人提供基于同一权威任务投影的项目任务看板，使其能安全查看执行进度、WorkItem 摘要与可用控制操作，而不产生第二份任务状态。

## ADDED Requirements

### Requirement: 项目任务看板投影

系统 SHALL 在项目工作区展示受控项目任务投影，按待执行、进行中、阻塞、待审核、已完成和已取消状态分组；同一任务的 revision、Run 和 WorkItem 摘要 MUST 来自同一权威查询结果。

#### Scenario: 加载项目任务
- **WHEN** 用户打开项目任务看板
- **THEN** 系统 MUST 显示当前项目的最多 50 条任务摘要及其状态、执行者和恢复提示，且不得显示其他项目的任务

#### Scenario: 空项目
- **WHEN** 当前项目没有可见任务
- **THEN** 系统 SHALL 显示空状态，且不得伪造示例任务或完成状态

### Requirement: 筛选与任务详情

系统 SHALL 提供本页任务的文本搜索、执行 Agent 与优先级筛选，并在用户选择任务时展示其语义引用、Run、WorkItem、阻塞、产物与可用操作摘要。

#### Scenario: 筛选当前页
- **WHEN** 用户输入搜索条件或选择筛选项
- **THEN** 系统 MUST 只更新当前已加载页面的呈现结果，并保留未提交的筛选输入

#### Scenario: 查看工作项
- **WHEN** 用户打开一条带有 Run 的任务详情
- **THEN** 系统 SHALL 展示该任务关联的 WorkItem 摘要，且不得把其他任务的 WorkItem 混入详情

### Requirement: 受控任务操作反馈

系统 MUST 仅对服务端声明可执行的 pause、resume、retry、cancel 操作发起控制请求，并携带当前任务 revision 与新的 requestId；操作结果 MUST 用权威投影更新卡片和详情。

#### Scenario: 操作成功
- **WHEN** 用户执行可用任务操作且服务端接受
- **THEN** 系统 SHALL 显示处理中状态，并在收到新投影后更新任务状态和 revision

#### Scenario: 操作被拒绝
- **WHEN** 服务端因版本冲突、运行时未恢复、权限或状态门控拒绝操作
- **THEN** 系统 MUST 保留原有权威状态并显示可操作的拒绝原因，且不得在客户端推断成功

### Requirement: 受限运行时边界

系统 MUST 通过桌面跨进程能力读取和控制实时任务；运行时不可用时 MUST 显示不可用状态，不得降级为 Web 服务端的本地伪运行时。

#### Scenario: 应用恢复后运行时尚未恢复
- **WHEN** 看板能读取持久任务投影但对应实时运行时尚未恢复
- **THEN** 系统 SHALL 显示任务及其恢复提示，并将实时控制显示为不可用

### Requirement: 独立项目任务分页查询

系统 SHALL 提供仅以 projectId、cursor 和 limit 查询任务页的桌面跨进程能力；该查询 MUST 不要求调用方提供 ontologyVersion，并且仍 MUST 使用当前项目的受控任务源。

#### Scenario: 项目无本体版本上下文
- **WHEN** 项目工作区只有 projectId 与 ontologyId
- **THEN** 系统 MUST 能分页读取该项目的任务投影，且不得猜测或降级使用 ontologyVersion
