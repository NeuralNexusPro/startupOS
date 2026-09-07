# SENSE.11 架构

## 影响模块

- `packages/core/src/lib/integrations/perception/wecom/`：Bot profile 校验与环境密钥解析契约。
- `packages/core/src/modules/perception-runtime/operations/`：企微启用门禁。
- `packages/desktop/src/main/services/perception-wecom/`：AI Bot WebSocket 生命周期、消息归一化和路由。
- `packages/web/src/components/os/sense-center/`：配置交互。

## 依赖方向

`desktop supervisor → core integration/runtime → storage/shared`，以及 `web component → web service → core feature`。Core 不依赖 Web 或 Desktop，符合 AGENTS.md 单向依赖规约。

## 数据与密钥

Connector `settings` 保存 `{ transport: 'aibot-websocket', botId, envPrefix }`，`secretRef` 保存 `secret://perception/env/{PREFIX}`。Desktop 从 `${PREFIX}_SECRET` 解析密钥；环境值永不写入配置。

## 运行协议

官方 SDK 发起 `aibot_subscribe`，处理 ping、指数退避重连和 `aibot_msg_callback`。msgid 作为稳定去重来源；Desktop 退出或连接停用时断开客户端。

## 安全与性能

XML 使用有界、无实体解析的根字段提取；配置按更新时间缓存，变更后重建 registry。错误只暴露稳定码。环境读取和本地文件读取为小型配置操作，不在 core 引入反向依赖。
