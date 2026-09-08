# OriginOS CE v0.2.1 Changelog

发布日期：2026-09-08

## Agent 运行时

- 将空响应恢复限定在 Skill 会话，避免普通 Agent 会话被不必要地自动重试。
- 修正异步恢复流程中的 TypeScript 类型收窄问题，确保严格编译配置下可以稳定构建。
- 清理 Completion Guard 重构后遗留的无效声明，同时保留现有扩展与测试兼容性。

## 感知中心

- 修复感知目标加载 Role Agent 时的注册表 IPC 路径，使感知规则可以正确派发到已注册角色 Agent。

## 构建验证

- Email、企业微信、飞书和钉钉感知插件均通过独立 TypeScript 构建。
- Windows、macOS arm64 和 macOS x64 安装包均通过 GitHub Actions 构建与运行时依赖校验。
