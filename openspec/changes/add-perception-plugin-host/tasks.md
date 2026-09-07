# Tasks

- [x] S12-T1（串行，架构）：Plugin SDK、manifest/schema/权限与项目地图；测试清单边界；证据为 Core tests/typecheck。
- [x] S12-T2（串行，依赖 T1，Runtime）：Registry/Host/生命周期/故障隔离；证据为生命周期与隔离测试。
- [x] S12-T3（串行，依赖 T2，Web/Desktop）：声明式 schema 配置和统一 provisioning 已完成；Plugin Host 统一调用插件 provision、Credential Port 和 Connector Store，旧 Email/WeCom/Feishu 专用 IPC/service 已删除；证据为 Host、插件、Web 表单和编译回归。
- [x] S12-T4（可并行，依赖 T2，Connector）：迁移 WeCom/Email；Email 已迁入独立 poll plugin，兼容旧 safeStorage 凭据与 UID 游标，移除 Desktop 独立 supervisor；证据为协议、游标、重连回归。
- [ ] S12-T5（可并行，依赖 T2，Connector）：迁移 Feishu/DingTalk；Feishu 官方 SDK WebSocket 插件、重连健康与双工回复已完成，DingTalk 待完成；证据为 webhook/stream 回归。
- [ ] S12-T6（串行，依赖 T3–T5，Integration）：bundled catalog 与 Email 运行时硬编码已清理；完整配置迁移及 Web/Core 平台分支需等待 T3、T5 完成；证据为迁移/依赖扫描。
- [ ] S12-T7（串行，QA）：全量测试、lint、typecheck、循环检查、Windows 打包、Story verification goal、合并和 worktree 清理。
