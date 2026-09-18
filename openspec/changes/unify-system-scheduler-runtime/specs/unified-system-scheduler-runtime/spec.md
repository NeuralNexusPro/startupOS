# Spec Delta

## Purpose

让用户定时任务和感知插件等后台周期工作共享统一的调度、并发和生命周期语义，同时保持系统任务隐藏、业务隔离和旧用户任务兼容。

## ADDED Requirements

### Requirement: 用户任务与系统任务共享调度运行时
系统 SHALL 通过同一个 Core Scheduler Runtime 调度持久化用户任务和业务 owner 注册的系统任务；Desktop MUST 不能为每个插件周期任务创建独立计时循环。

#### Scenario: 邮箱插件注册周期任务
- **WHEN** 一个已启用邮箱连接器启动并通过 Plugin SDK 注册轮询
- **THEN** Desktop SHALL 将它注册为统一 Runtime 中的 system owner 任务，且 Plugin Host 不创建邮箱专用 `setInterval`

#### Scenario: 多类任务同时到期
- **WHEN** 用户任务与多个系统任务在同一调度窗口到期
- **THEN** Runtime SHALL 分别派发它们，单个系统任务执行不得阻塞其他 owner 的派发

### Requirement: 系统任务默认隐藏且归属明确
每个系统任务 SHALL 具有稳定任务标识和受控 owner 标识，并 MUST 默认不出现在普通用户任务查询中；内部诊断 SHALL 能显式查询安全运行快照。

#### Scenario: 普通任务列表
- **WHEN** Runtime 同时包含用户任务和邮箱系统任务
- **THEN** 普通任务列表 SHALL 只返回用户任务，系统任务只能通过内部系统任务查询获得

#### Scenario: 旧用户任务
- **WHEN** 读取没有 owner 或 visibility 字段的旧用户任务
- **THEN** Runtime SHALL 将其按用户任务处理并保持原任务标识、触发器和动作语义

### Requirement: 单任务防重和失败隔离
Runtime SHALL 保证同一系统任务同一时刻至多一个执行实例；失败 SHALL 只对该任务应用有界退避和 jitter，不能延迟其他 owner。

#### Scenario: 上次执行未结束
- **WHEN** 系统任务仍在执行且下一个触发点到达
- **THEN** Runtime SHALL 跳过该次重入并记录安全跳过状态，不并发调用相同 callback

#### Scenario: 单邮箱连续失败
- **WHEN** 一个邮箱轮询连续失败而另一个邮箱正常
- **THEN** Runtime SHALL 只增加失败邮箱的退避，正常邮箱继续按自己的间隔运行

#### Scenario: 达到退避上限
- **WHEN** 系统任务持续失败
- **THEN** 下一次执行延迟 SHALL 不超过配置的最大退避，并且成功后恢复正常间隔

### Requirement: 配置与生命周期同步
业务 owner SHALL 能幂等注册、重排和注销系统任务；应用退出 SHALL 停止新派发并等待已开始任务安全结束，连接器配置变更 MUST 不能留下重复任务。

#### Scenario: 修改轮询间隔
- **WHEN** 已启用连接器的轮询间隔发生变化并触发插件重载
- **THEN** 旧系统任务 SHALL 被注销，新任务 SHALL 使用相同稳定归属和新间隔注册，运行时只保留一个有效任务

#### Scenario: 停用连接器
- **WHEN** 用户停用或删除连接器
- **THEN** 对应系统任务 SHALL 被注销且不再触发

#### Scenario: 应用退出时任务在途
- **WHEN** Desktop 退出而系统任务仍在执行
- **THEN** Runtime SHALL 停止新触发并等待在途任务完成或按受控关闭策略结束

### Requirement: 运行诊断保持脱敏
系统任务运行快照和日志 SHALL 区分调度、执行、重入跳过与失败退避，并 MUST 不能包含凭据、邮件正文、原始 payload 或不受控异常文本。

#### Scenario: 邮箱认证失败
- **WHEN** 邮箱 callback 抛出包含服务端详情的错误
- **THEN** Scheduler 诊断 SHALL 只记录任务标识、owner、阶段和安全错误码，不记录异常正文或凭据
