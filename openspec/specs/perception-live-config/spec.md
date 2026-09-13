# perception-live-config Specification

## Purpose
TBD - created by archiving change fix-perception-live-config. Update Purpose after archive.
## Requirements
### Requirement: 感知配置无需应用重启生效
系统 SHALL 在运行中发现启用、停用和配置版本变化，并使用已验证的新配置运行连接。
#### Scenario: 快速重新绑定并启用
- **WHEN** 已运行连接重新绑定并在下一次协调前重新启用
- **THEN** 下一轮协调停止旧实例并启动新配置，即使凭据引用路径没有变化
#### Scenario: 新增与稳定配置
- **WHEN** 新连接启用或已运行配置未改变
- **THEN** 新连接在下一轮协调启动，稳定连接不重复启动
#### Scenario: 异步启动与停用
- **WHEN** 启动未完成期间有下一轮协调或服务停止
- **THEN** 不产生重复实例或停止后的复活实例

### Requirement: 感知健康展示自动更新
系统 SHALL 自动显示后台连接的最新健康状态，无需重启应用或手动刷新。
#### Scenario: 后台连接完成
- **WHEN** 启用后后台连接由未启动变为健康
- **THEN** 已打开的感知中心与状态展示在后续刷新呈现健康
#### Scenario: 刷新生命周期
- **WHEN** 自动刷新执行或展示组件卸载
- **THEN** 刷新不覆盖用户操作错误，卸载后清理所拥有的计时器

