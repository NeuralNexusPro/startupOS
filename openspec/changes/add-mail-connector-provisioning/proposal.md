## Why

感知中心当前只能保存 Email connector 的骨架字段和 secret reference，尚不能安全保存真实凭据、测试 IMAP 连接或由 Desktop 常驻轮询。用户无法仅通过产品界面完成邮箱接入。

追溯：`epic-id: epic-SENSE`，`story-id: SENSE.10`。

## What Changes

- 新增完整 IMAP profile 与验证 receipt。
- 新增 Electron safeStorage 凭据 adapter 和受控 IPC，真实 secret 不经过 Web API。
- 新增 IMAP 测试连接与稳定安全错误码。
- 新增 Desktop MailConnectorSupervisor，复用既有 EmailPoller、游标、健康、重试和事件路由。
- 扩展感知中心 Email 配置、测试、启停和重新绑定交互。

## Capabilities

### Modified Capabilities

- `external-perception-runtime`：Email connector 由配置骨架升级为可运行实例。
- `perception-connectors`：增加 IMAP provisioning、credential 和 supervisor lifecycle contract。

## Impact

- Core：Mail profile/ports/validation。
- Desktop：safeStorage、IMAP adapter、IPC、Supervisor。
- Web：Email 表单与 Electron-only 凭据操作。
- Dependency：Desktop 集成包增加 `imapflow`，Core 不直接依赖它。
