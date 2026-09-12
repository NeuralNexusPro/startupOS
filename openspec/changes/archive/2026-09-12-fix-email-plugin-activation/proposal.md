## Why
用户报告 QQ IMAP 点击启用即失败。直连 TLS/login 成功；插件 provision 不保存 testReceipt，启用门禁仍要求该记录。
## What Changes
Desktop 成功 provision 邮箱后复用既有 profile fingerprint 保存验证记录，保留启用门禁与配置绑定。
## Capabilities
### New Capabilities
- `email-plugin-activation`: 邮件插件配置验证与启用衔接。
### Modified Capabilities
## Impact
Epic SENSE / Story SENSE.12 / Task SENSE12-T2。Desktop 插件组装和集成测试；不修改凭据安全或底层 IMAP。用户已授权排查并处理连接失败，沿本轮修复直接实施。
