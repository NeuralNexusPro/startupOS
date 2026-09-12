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

## 2026-09-11 — docs：架构治理首轮检查修正提案

**类型**：docs
**影响模块**：docs/specs/epic-AG、openspec/changes/fix-monorepo-boundary-lint
**摘要**：复现旧 ESLint 目录边界随 CWD 漏报，建立 AG5-T1 提案、正反例验收和实施边界。当前待批准，未修改应用源码或宣称完成架构治理。

## 2026-09-11 — fix：恢复 Monorepo 架构边界检查

**类型**：fix
**影响模块**：.eslintrc.cjs、scripts/check-architecture-boundaries.cjs、package.json、AGENTS.md、docs/specs/epic-AG
**摘要**：使用固定仓库根与各包 resolver 修复随 CWD 漏报，复用现有 ESLint 新增 lint:boundaries 与真实导入自测，零新增依赖。43 × 2 用例通过，原 lint 非架构诊断零变化；扫描 853 个生产文件记录 34 条未解决存量，不掩盖违规。

## 2026-09-12 架构治理与通知入口修复

- AG2-T1 消除原34处边界违规：Core业务组装从基础设施上移，公共DTO/解析/配置下沉，通用聊天组件归位；原围栏下866生产文件0诊断。
- 修复通知打开中文技能/角色的CHANNEL_RUNTIME_FAILED：业务目录标识支持Unicode，保留传输与路径安全限制。
- 修复会话复用覆盖记忆快照；新增真实worker冷启动/工具执行与Role/Project恢复验证。
- 完整桌面构建通过；保留15项既有协作测试失败，无本次新增失败。Story实现与验证详见docs/specs/epic-AG/story-AG.2/。

### 2026-09-12：旧通知会话继续发送兼容修复

AG2-T2 修复旧角色/Skill/助手会话缺入口元数据时被映射为项目，导致 CHANNEL_RUNTIME_FAILED；保留显式元数据优先与路径校验。Desktop 18、Core Channel 43 项回归通过。

### 2026-09-12：邮箱插件保存后无法启用

SENSE12-T2 修复成功 IMAP 验证没有保存 testReceipt、被旧启用门禁拒绝的问题。Desktop 宿主补齐绑定配置的验证记录；8项集成回归通过，保留失败与配置变更拒绝逻辑。现有 qq 连接已真实重验证并补记录，未保存授权码、未自动启用重复连接。
