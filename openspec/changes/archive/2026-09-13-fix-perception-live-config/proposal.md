## Why
用户报告感知中心配置后需重启应用才能生效。已确认运行中连接只按ID去重，重绑定后快速启用会永久保留旧配置；UI健康状态也只加载一次。
## What Changes
- 既有5秒协调识别配置版本变化并安全替换旧连接，保持停用与失败重试。
- 感知中心/状态展示自动刷新后台健康结果，不需重启或手动刷新。
## Capabilities
### New Capabilities
- `perception-live-config`: 感知运行时配置与展示的热更新。
### Modified Capabilities
## Impact
Epic SENSE / Story SENSE.12 / Task SENSE12-T3。Desktop Host和测试、Web感知状态展示/store和测试。用户已授权持续处理配置后不生效问题；不新增依赖、不迁移数据、不修改规则或凭据门禁。
