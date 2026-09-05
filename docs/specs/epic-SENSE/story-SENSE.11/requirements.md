# SENSE.11 需求

## 需求来源

SENSE.4 已具备自建应用回调协议适配，但产品默认入口应对齐 Hermes，使用企业微信 AI 智能机器人 WebSocket Gateway。本 Story 补齐可配置、可启用、可接收的长连接闭环。

## 详细需求

1. 企业微信智能机器人配置包含 Connector ID、Bot ID 和环境密钥前缀；Secret 不经 Web 表单和管理 API 传输。
2. Desktop supervisor 使用官方 AI Bot SDK 连接 `wss://openws.work.weixin.qq.com`，由 SDK 处理认证、心跳和重连。
3. 文本和语音转文字消息归一化为感知事件，保留 msgid、用户和会话标识并进入既有规则路由。
4. 配置缺失、停用、密钥缺失或认证失败时故障隔离并记录脱敏健康状态。
5. 原自建应用 HTTP 回调仅作为兼容能力，不作为感知中心默认企微入口。

## 验收标准

- Given 已保存并启用的企微机器人和正确 Secret，When Desktop 启动，Then 建立并维持 WebSocket 认证连接。
- Given 智能机器人收到文本或语音消息，When SDK 分发消息帧，Then 生成 `message.received` 事件并执行匹配规则。
- Given 连接停用或密钥不存在，When 请求回调，Then 在进入路由前拒绝且响应不泄露密钥。
- Given 用户打开企微配置，When 输入合法 ID、Receive ID、环境变量前缀并保存，Then 连接以停用状态保存且页面可复制准确回调路径。

## 边界与异常

- Connector ID 仅允许安全 ID 字符；Receive ID 与环境前缀不可为空。
- 环境变量前缀仅允许大写字母、数字和下划线。
- 启用时环境密钥不可用则拒绝启用。

## 依赖

依赖 SENSE.4、SENSE.7、SENSE.8、SENSE.9；复用 Connector Store、事件存储和 PerceptionRouter。

## 非功能需求

- 回调解析与装载不引入数据库或后端框架。
- 密钥不落入 `data/perception/connectors`、HTTP 响应或审计。
- 单次回调本地处理开销目标小于 500ms（不含目标异步执行）。
