## ADDED Requirements

### Requirement: 按插件独立记录每日诊断
系统 SHALL 将四个感知插件及其SDK诊断写入应用logs/plugins/{插件名}/plugin-YYYY-MM-DD.log，不向desktop/llm文件重复输出相同插件诊断。

#### Scenario: 两个插件并发
- **WHEN** 企微和飞书的多个连接同时输出诊断
- **THEN** 每条记录仅进入对应插件文件，pluginId/connectorId归属正确

#### Scenario: SDK默认工厂输出
- **WHEN** 四插件的默认SDK实例发生连接失败或重连
- **THEN** 错误进入插件日志，默认console出口不重复泄漏错误

### Requirement: 渠道错误可关联与定位
系统 SHALL 保存渠道失败阶段、诊断ID、安全错误码和脱敏原因，按可用信息关联事件与会话，并将诊断引用保留到感知审计。

#### Scenario: 聊天运行失败
- **WHEN** IM消息的prompt或输出持久化失败
- **THEN** 插件日志可定位sessionId/eventId及原因，IM只有安全错误，审计可关联诊断ID

#### Scenario: 会话创建失败
- **WHEN** resolve在生成sessionId前抛错
- **THEN** 仍以pluginId/connectorId/eventId记录阶段与原因，不伪造会话或成功终态

### Requirement: 脱敏与隔离边界
系统 MUST 由Host绑定日志归属，并对错误摘要、cause和stack限长脱敏，禁止正文、凭据及附件进入日志。

#### Scenario: SDK错误含秘密或大对象
- **WHEN** 错误嵌套token、Authorization、带凭据URL或超长正文
- **THEN** 输出不包含秘密或正文，大小有界且保留安全错误分类

#### Scenario: 非法插件路径
- **WHEN** 插件提供伪造归属或路径逃逸标识
- **THEN** Host拒绝越界，不写入任意文件

### Requirement: 日志故障不破坏消息处理
系统 SHALL 异步有界写入、按日轮转及正常退出flush，日志失败不得引起聊天重试或未处理拒绝。

#### Scenario: 写盘失败与高频输出
- **WHEN** 磁盘不可写或SDK连续输出超出缓冲上限
- **THEN** 消息链不被阻塞或改为失败，缓冲有界，写入失败或丢弃数量可观测且不递归刷日志

#### Scenario: 跨日与进程退出
- **WHEN** 插件跨午夜运行并正常关闭应用后重启
- **THEN** 记录归入正确日期，待写日志flush，重启追加而非覆盖旧文件
