# Story OS.17: 无项目首页与 Agent 思考内容显示优化

**Epic:** OS - Phase 0 OS 交互基础
**Status:** Planning
**Owner:** Product / Engineering
**Created:** 2026-07-22
**Last Updated:** 2026-07-22

---

## Story 概览

### User Story

作为首次进入或当前没有项目的 OriginOS 用户，
我希望首页只呈现一套清晰的默认应用入口，并且所有 Agent 窗体只展示可交付回复而不泄露 Pi Agent 内部思考 turn，
以便默认桌面状态干净、可信，并且不会把内部推理过程暴露给终端用户。

### 背景与已知原因

- 无项目时，[packages/web/src/app/page.tsx](/mnt/f/workspace/startupOS/packages/web/src/app/page.tsx) 同时渲染 `WelcomeSection` 内部的 `HOME_APPS` 和后续无条件的 Home Apps Section，导致默认应用启动器重复出现。
- [packages/web/src/components/framework/AppCard.tsx](/mnt/f/workspace/startupOS/packages/web/src/components/framework/AppCard.tsx) 的 Dock pin 逻辑与 [packages/web/src/store/dockStore.ts](/mnt/f/workspace/startupOS/packages/web/src/store/dockStore.ts) 的持久化合并逻辑需要保持幂等，避免默认应用在无项目还原、Dock 同步或 Electron 独立 Dock 窗口中出现重复。
- [packages/web/src/app/api/agent/sessions/[sessionId]/messages/route.ts](/mnt/f/workspace/startupOS/packages/web/src/app/api/agent/sessions/[sessionId]/messages/route.ts) 和 [packages/web/src/app/api/agent/projects/[projectId]/messages/route.ts](/mnt/f/workspace/startupOS/packages/web/src/app/api/agent/projects/[projectId]/messages/route.ts) 已经静默累积 `thinking_delta`，但部分路径仍把 `thinking` 写入消息 metadata 或历史消息，使若干窗体可能展示 Pi Agent 的内部思考 turn。

### 验收标准（简要）

- [ ] AC1: 无项目首页只显示一套默认应用启动器，不在 Welcome 和主应用区重复展示同一组 `HOME_APPS`。
- [ ] AC2: 默认应用、Dock pinned apps、Electron Dock 同步在重复进入首页、刷新和无项目还原后保持幂等。
- [ ] AC3: SkillDialog、AgentDialog、项目 Agent 窗体和历史消息视图不显示 `thinking`、`turn_start`、`turn_end`、provider reasoning 标签或内部思考内容。
- [ ] AC4: 更新后的首页首屏在无项目状态下仍保留创建项目、Spotlight、工作区/默认应用入口，且响应式布局无重叠。
- [ ] AC5: 自动化测试覆盖默认应用去重、Dock merge 去重、SSE/历史消息思考内容过滤。

---

## 文档导航

- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [开发文档](./implementation.md)
- [测试文档](./testing.md)
- [返回 Epic OS](../README.md)

---

## 进度跟踪

- [x] 初步问题定位
- [x] Story 文档创建
- [ ] 需求评审
- [ ] 实施
- [ ] 自动化测试验证
- [ ] 架构规约检查

---

## 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-07-22 | 创建优化 Story，记录默认应用重复与 Agent 思考内容泄露的原因和实施方案 | Codex |
