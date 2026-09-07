# Tasks

- [x] S12-T1（串行，架构）：Plugin SDK、manifest/schema/权限与项目地图；测试清单边界；证据为 Core tests/typecheck。
- [x] S12-T2（串行，依赖 T1，Runtime）：Registry/Host/生命周期/故障隔离；证据为生命周期与隔离测试。
- [ ] S12-T3（串行，依赖 T2，Web/Desktop）：声明式配置和统一 provisioning；飞书 App ID/App Secret 安全 provisioning 已完成，通用 schema renderer 待完成；证据为 UI/IPC/Secret 测试。
- [ ] S12-T4（可并行，依赖 T2，Connector）：迁移 WeCom/Email；WeCom 已迁移，Email 待迁移；证据为协议、游标、重连回归。
- [ ] S12-T5（可并行，依赖 T2，Connector）：迁移 Feishu/DingTalk；Feishu 官方 SDK WebSocket 插件、重连健康与双工回复已完成，DingTalk 待完成；证据为 webhook/stream 回归。
- [ ] S12-T6（串行，依赖 T3–T5，Integration）：配置迁移、打包 catalog、清除硬编码；证据为迁移/依赖扫描。
- [ ] S12-T7（串行，QA）：全量测试、lint、typecheck、循环检查、Windows 打包、Story verification goal、合并和 worktree 清理。
