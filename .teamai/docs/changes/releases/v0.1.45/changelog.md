# OriginOS CE v0.1.45 Changelog

发布日期：2026-07-28

## 修复

- 修复流式消息完整到达渲染进程后，界面仍可能只显示开头两个字的问题。
- 流事件改为按 32ms 上限主动推进累计文本，定时器仅作为补帧兜底。
- 最终消息到达时同步提交剩余正文，不再依赖可能被延迟的渲染定时器。
- 普通 Agent、持久 Agent 和项目 Agent 的 `done` 事件统一携带最终正文。

## 诊断

- 增加流输入提交、定时器调度、定时器触发和最终提交日志。
- 日志记录累计长度与渲染长度，便于定位流传输和前端渲染之间的差异。

## 验证

- Windows StreamRenderScheduler 单元测试：8 项通过。
- Core TypeScript 检查通过。
- Desktop TypeScript 检查通过。
- 243 字模拟流完成 51 次渐进提交，并以完整正文结束。
- Windows、macOS 构建、签名、更新元数据、七牛资源和 GitHub Release 由 GitHub Actions 发布链路继续验证。
## 2026-07-29 — docs：Story 实施增加独立分支与 Worktree 隔离规约

**类型**：docs
**影响模块**：`AGENTS.md`, `docs/changes/changelog.md`, `docs/changes/releases/v0.1.45/changelog.md`
**摘要**：AGENTS.md 升级到 v2.4.0。每个 Story 必须从最新 `dev` 创建独立的 `story/{story-id}-{short-slug}` 分支，并在独立 worktree 中实施、测试和提交；不同 Story 禁止共用分支、worktree、提交或 PR。验证和审查通过后统一合并到 `dev`，再清理对应 worktree。共享前置能力必须先拆成独立 Story 合并，紧急例外需明确批准并记录补偿措施。

## 2026-07-29 — docs：实施隔离边界调整为 OpenSpec Proposal

**类型**：docs
**影响模块**：`AGENTS.md`, `docs/changes/changelog.md`, `docs/changes/releases/v0.1.45/changelog.md`
**摘要**：AGENTS.md 升级到 v2.5.0。Story 继续作为需求和验收边界，但不再直接对应 Git 分支；Story 中每个可独立交付的 Task 必须一对一创建并审批 OpenSpec Proposal。Proposal 使用独立集成分支和主 worktree，应用源码必须由 subagents 在互相隔离的 Task 分支/worktree 中实施；Proposal 主 worktree 仅负责规格、编排、集成和总体验证。完成后 Task 分支先合并回 Proposal 分支，通过完整测试、OpenSpec strict validation 和 Story 验证 goal 后再合并到 `dev`。

## 2026-07-29 — docs：OpenSpec 初始化配置对齐 1.4.x Schema Workflow

**类型**：docs
**影响模块**：`AGENTS.md`, `openspec/config.yaml`, `.codex/skills/openspec-*`, `docs/changes/changelog.md`, `docs/changes/releases/v0.1.45/changelog.md`
**摘要**：确认 OpenSpec 1.4.1 初始化采用 `openspec/config.yaml` 和生成式 agent skills，不再强制依赖旧版 `openspec/AGENTS.md`、`project.md`。AGENTS.md 升级到 v2.5.1，并要求使用 CLI 返回的 planning/artifact 路径。`openspec/config.yaml` 补充 OriginOS 技术栈、依赖围栏、Story Task 与 Proposal 一对一追踪规则，以及 Proposal、Specs、Design、Tasks 的 subagent/worktree、测试和 Evidence 门禁。
