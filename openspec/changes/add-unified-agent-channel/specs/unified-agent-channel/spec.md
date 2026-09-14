# Unified Agent Channel

## ADDED Requirements

### Requirement: 唯一消息入口
系统 MUST 让 OS UI 与外部渠道通过同一 Message Ingress 完成 Session 消息持久化和 Runtime 调用。

#### Scenario: 两种渠道等价输入
- **WHEN** OS 输入框和企微分别发送标准消息
- **THEN** 系统 SHALL 产出相同语义的 Session 记录与 OutputEvent

### Requirement: 全 Runtime 覆盖
系统 MUST 支持 Agent、RoleAgent、Project Agent、Skill 和 Project Multi-Agent/Collaboration Runtime。

#### Scenario: 项目多 Agent 输入
- **WHEN** Channel 目标为 Project Multi-Agent
- **THEN** 系统 SHALL 经项目编排器执行并返回聚合的用户可见输出

### Requirement: 双工输出协议
系统 MUST 以 FBP 有类型 Packet 的有序事件流返回可见输出，并由 Channel Adapter 完成平台投递、幂等和 receipt。

#### Scenario: 多段回复
- **WHEN** Runtime 产生多个 Assistant 输出与工具状态
- **THEN** Channel SHALL 按序投递允许的事件且只结束一次主回复流

### Requirement: 有界流与背压
系统 MUST 使用有界命名 Port 连接 Channel Processes，并让异步 send 在缓冲区满时向上游传播背压。系统 MUST 保证 flow 内序号单调递增、终态唯一，并支持取消向 Runtime 传播。

#### Scenario: 慢速渠道消费
- **WHEN** Delivery 消费速度低于 Runtime 输出速度且 Port 已满
- **THEN** 上游 SHALL 等待容量释放或按明确策略安全降级，不得无限缓存或静默丢包

#### Scenario: 消费方取消
- **WHEN** Channel 消费方取消仍在运行的 flow
- **THEN** Runtime SHALL 收到取消信号，flow SHALL 只产生一次 cancelled 终态且拒绝后续数据包

### Requirement: 会话关联与安全隔离
系统 MUST 持久化渠道会话到 OriginOS Session 的绑定，且 MUST 禁止平台 Secret、原始 token、内部思考和工具参数跨越 Channel 边界。

#### Scenario: 连续对话
- **WHEN** 同一渠道会话向同一目标连续发送消息
- **THEN** 系统 SHALL 复用 Session，并只通过 opaque reply handle 回复
