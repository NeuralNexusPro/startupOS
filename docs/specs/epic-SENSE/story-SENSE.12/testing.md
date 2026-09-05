# SENSE.12 测试

自动化验证 Goal：通过 SENSE.12 的 Plugin Contract、Host 生命周期、声明式配置、安全隔离和四渠道迁移用例。

| ID | 层级 | 场景 | 预期 |
|---|---|---|---|
| S12-UT-01 | Core | manifest/schema 边界 | 合法注册；非法版本、路径、字段、capability 拒绝 |
| S12-UT-02 | Core | 权限 context | 只能调用声明且获批的 Port |
| S12-IT-01 | Host | discover/start/stop/restart | 幂等，无 timer/socket 泄漏 |
| S12-ISO-01 | Host | 单插件崩溃 | 其他插件继续，健康和审计脱敏 |
| S12-SEC-01 | Desktop | 四插件 Secret | 仅经 IPC/safeStorage，配置/日志/响应不可检索 |
| S12-UI-01 | Web | 四 schema 渲染 | 无平台条件组件，字段、错误、可访问性正确 |
| S12-MIG-01 | Core | 旧配置迁移 | ID/source/enabled/secret/cursor/rule 保持且幂等 |
| S12-PLG-01 | Plugin | Email | 增量、正文和故障语义保持 |
| S12-PLG-02 | Plugin | WeCom | 消息、重连、去重保持；使用原始 SDK frame 将本次目标执行的全部 Assistant 文本按序回复，且只在末段结束 stream |
| S12-PLG-03 | Plugin | Feishu | 验签、挑战、ACK 保持 |
| S12-PLG-04 | Plugin | DingTalk | 认证、回调、ACK 保持 |
| S12-PKG-01 | Packaging | Windows/macOS | bundled catalog 与依赖完整 |
| S12-DEP-01 | Architecture | lint/madge/import scan | 无循环、反向依赖、平台分支 |

执行 Core/Desktop/Web/四插件 Vitest、typecheck、lint、循环依赖、Windows 打包和脚本化验收。真实平台测试记录人工步骤、脱敏证据和风险。实施完成后必须创建并完成本 Story 自动化验证 Goal。

## 2026-09-04 企微首插件验证

- Core Plugin Host：6 项测试通过；企微既有协议回归：6 项通过。
- WeCom plugin：manifest、文本/语音归一化、Secret Port、socket 生命周期共 6 项通过。
- Core/Web typecheck 与 Desktop build 通过；相关 ESLint 0 error（保留既有 warning）；`git diff --check` 通过。
- 依赖扫描确认通用 Host/Registry 无渠道名称分支，企微官方 SDK 仅由 `@originos/perception-plugin-wecom` 持有；Electron 打包清单显式包含插件和 SDK。
- 尚未使用真实 Bot ID/Secret 联机，Windows 打包态和企微服务端连接作为 S12-T7 人工/打包验收剩余项。
