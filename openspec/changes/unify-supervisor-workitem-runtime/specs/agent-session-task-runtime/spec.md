# Spec Delta

## ADDED Requirements

### Requirement: 多 Agent 协作运行必须绑定父 Pi Task
系统 SHALL 在项目任务看板中接收自然语言目标后，先创建或恢复当前项目下的父 Pi Task 与父 Step，再启动与其绑定的协作 Run。父 Pi Task 是用户任务规划、验收条件和最终完成状态的唯一事实源。

#### Scenario: 从自然语言目标启动协作
- **WHEN** 用户在项目任务看板提交一个新的自然语言目标
- **THEN** 系统 MUST 创建或幂等恢复一个父 Pi Task、父 Step 与正式协作 Run
- **AND** 协作 Run 的每个 WorkItem SHALL 绑定该父 Task、父 Step、精确方案版本和执行契约 hash

#### Scenario: WorkItem 完成但父任务尚未满足验收
- **WHEN** 一个或多个 WorkItem 已完成但父 Pi Task 的验收条件尚未获得足够证据
- **THEN** 系统 MUST 保持父 Pi Task 为未完成状态
- **AND** 不得用 WorkItem completed 或 Supervisor 文本结论直接完成父 Pi Task

#### Scenario: 所有必要证据通过
- **WHEN** 必要 WorkItem 的验证结果和证据已经被父 Task Evidence Gate 接纳
- **THEN** 系统 SHALL 根据父 Pi Task 状态机进入待验收或完成状态
- **AND** 看板 SHALL 以父 Pi Task 状态显示整体任务结果

#### Scenario: 同一发布请求重复提交
- **WHEN** 客户端因重试再次提交同一项目、同一自然语言目标和同一 requestId
- **THEN** 系统 MUST 返回同一个父 Pi Task 与协作 Run
- **AND** 不得创建重复任务或重复 WorkItem

### Requirement: 历史协作会话只读兼容
系统 SHALL 保留旧 Supervisor 黑板会话的历史读取能力，但新发布的项目协作任务 MUST 使用父 Pi Task 与正式 WorkItem 账本；系统不得在读取、启动或升级过程中静默改写历史会话。

#### Scenario: 查看旧协作会话
- **WHEN** 用户打开仅包含旧黑板任务记录的历史协作会话
- **THEN** 系统 SHALL 继续展示其消息、状态和产物
- **AND** 应明确将其标记为历史运行，不把它伪装成正式 WorkItem 运行

#### Scenario: 新任务发布
- **WHEN** 用户在升级后的任务看板发布新的多 Agent 目标
- **THEN** 系统 MUST 走父 Pi Task 与正式 WorkItem 路径
- **AND** 不得新增第二套可写黑板任务状态
