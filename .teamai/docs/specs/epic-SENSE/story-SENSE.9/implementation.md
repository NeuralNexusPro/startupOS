# SENSE.9 实施

- [x] 注册 Sense Center 首页顶层能力区与 AppWindowManager 窗体，不进入应用启动器配置。
- [x] 实现管理 API 薄边界、Web service 和 Zustand store。
- [x] 实现四个视图及平台专属连接表单。
- [x] 实现规则向导、ownership/授权校验与预览。
- [x] 实现事件链路、DLQ replay、空/错/加载状态。
- [x] 完成组件、API 集成、脚本化用户流程、可访问性和性能验证；Playwright 未配置，保留人工浏览器验收。

产品入口依赖 SENSE.8 facade；未配置时展示 onboarding，不影响主动会话。
