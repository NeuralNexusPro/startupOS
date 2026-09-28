# OriginOS CE v0.1.14 更新说明

## 2026-07-15 — docs：更新当前实现版 PRD 并新增产品白皮书

**类型**：docs
**影响模块**：`docs/product/PRD-Main.md`, `docs/product/OriginOS-CE-Whitepaper.md`
**摘要**：根据当前代码实现重写 OriginOS CE PRD，将首页工作台、Agent/Skill、项目、定时任务、系统通知、认知沉淀、多 Agent 协作、桌面打包与自动更新纳入当前产品范围。新增产品说明白皮书，面向非研发读者说明产品定位、能力版图、典型场景、技术架构、部署与后续方向。

## 2026-07-15 — docs：新增官网产品 PR 稿

**类型**：docs
**影响模块**：`docs/product/OriginOS-CE-Website-PR.md`
**摘要**：基于产品概念愿景和当前 PRD 新增官网投放用产品 PR 稿，弱化技术语言，突出个人业务操作系统、长期协作角色、技能、项目空间、通知定时任务和经验沉淀等当前可表达的产品能力。

## 2026-07-15 — fix：优化多 Agent 协同图视觉设计

**类型**：fix
**影响模块**：`packages/core/src/modules/collaboration-runtime/ui/TopologyGraph.tsx`, `src/modules/collaboration-runtime/ui/TopologyGraph.tsx`
**摘要**：多 Agent 协同拓扑图恢复白底画布，优化节点对比度、中文标签、状态样式和自适应画布视图。节点去除英文与 ID 展示，画布可撑满内容区并自动 fit view，提升协作关系浏览体验。

## 2026-07-15 — feat：LLM 配置支持请求字段映射

**类型**：feat
**影响模块**：`packages/core/src/lib/integrations/pi-agent/llm-config.ts`, `packages/core/src/lib/integrations/pi-agent/server-config.ts`, `packages/web/src/store/settingsStore.ts`, `packages/web/src/components/os/settings/SettingsDialog.tsx`
**摘要**：LLM 运行时配置新增 `mapping` 字段，可通过设置页 JSON 配置请求字段映射，例如将 `max_tokens` 映射为 `max_completion_tokens`。OpenAI-compatible 模型创建时会使用该映射覆盖底层 `compat.maxTokensField`，并随用户配置持久化。

## 2026-07-15 — fix：LLM 凭证归一化避免 401

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/llm-config.ts`, `packages/web/src/store/settingsStore.ts`, `packages/core/src/lib/integrations/pi-agent/__tests__/server-config.test.ts`
**摘要**：运行时和设置页会从结构化 key payload 中提取真实凭证值，并自动去除用户输入中的 `Bearer ` 前缀，避免 OpenAI-compatible 请求把 JSON 字符串或双 Bearer 当作 token 导致 401。

## 2026-07-15 — feat：标准化桌面端七牛发布流程

**类型**：feat
**影响模块**：`packages/desktop/scripts/release-qiniu.js`, `packages/desktop/scripts/publish-qiniu-updates.js`, `packages/desktop/scripts/verify-mac-signing.js`, `packages/desktop/package.json`, `package.json`
**摘要**：新增统一发布入口 `release-qiniu.js`，串联版本更新、应用构建、Electron 签名打包、macOS 签名校验、七牛上传和官网发布接口通知。脚本支持失败重试、断点跳过已上传产物，并兼容新版 `codesign` 输出。

## 2026-07-17 — feat：发布通知附带版本更新说明

**类型**：feat
**影响模块**：`packages/desktop/scripts/release-notes.js`, `packages/desktop/scripts/publish-qiniu-updates.js`, `packages/desktop/scripts/notify-release-service.js`, `docs/changes/releases/v0.1.14/changelog.md`
**摘要**：发布流程新增版本更新说明生成器，优先读取当前版本归档 changelog，生成结构化 changelog、Markdown release notes 和摘要。七牛发布后的官网接口通知以及独立通知脚本都会携带版本更新信息，便于官网展示每个版本的更新内容。

## 2026-07-17 — docs：变更记录按版本目录归档

**类型**：docs
**影响模块**：`AGENTS.md`, `CLAUDE.md`, `docs/changes/releases/README.md`, `docs/changes/releases/v0.1.14/changelog.md`
**摘要**：架构围栏中的变更管理规则改为“全量流水 + 版本目录归档”双轨制。每次变更除更新 `docs/changes/changelog.md` 外，还必须维护当前发布版本目录 `docs/changes/releases/v<version>/changelog.md`，目录名必须携带版本号。

## 2026-07-17 — fix：过滤 Pi Agent 用户可见消息中的思考内容

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/display-content.ts`, `packages/core/src/lib/integrations/pi-agent/message.ts`, `packages/core/src/lib/features/skills/service.ts`, `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`, `packages/web/src/app/api/agent/sessions/[sessionId]/messages/route.ts`
**摘要**：修复部分模型只返回 thinking block 或在 text 中混入 `<think>`/`<thinking>` 标签时，Pi Agent 会把思考内容当作正文展示的问题。用户可见的消息提取现在只使用 text block，并清理 provider thinking 标签；thinking fallback 保留为显式兼容能力但不再用于生产展示链路。

## 2026-07-17 — docs：Epic/Story 实施增加测试闭环规约

**类型**：docs
**影响模块**：`AGENTS.md`, `CLAUDE.md`, `docs/changes/releases/v0.1.14/changelog.md`
**摘要**：架构围栏新增 Epic/Story 测试闭环要求：实施 Story 前必须确认或补齐功能测试 case，功能完成后必须创建自动化测试验证 goal，且 goal 目标明确为通过该 Story 的测试 case。实施检查清单同步加入测试 case 前置检查、实现对齐和完成后 goal 验证项。

## 2026-07-17 — fix：修复 Windows 打包版技能工作目录解析错误

**类型**：fix
**影响模块**：`packages/core/src/lib/integrations/pi-agent/tools/bash-tools.ts`, `packages/desktop/src/main/main.ts`, `packages/web/src/components/skills/SkillDialog.tsx`
**摘要**：修复 Windows 打包版打开内置技能时工作目录显示为 `/workspace`、输出目录未设置的问题。根因是 bash 工具缺少 Windows 平台支持，导致回退到 Git Bash 时 MSYS 路径转换异常且 HOME 环境变量未设置。新增 `isWindowsPlatform()` 和 `buildShellInvocation()` 支持 PowerShell/cmd 原生执行；Electron 主进程显式注入 HOME 环境变量；SkillDialog 在 outputDir 等于 workDir 时仍注入路径兜底。
