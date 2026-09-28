# 开发文档 - Story OS.17

**Story:** 无项目首页与 Agent 思考内容显示优化
**版本:** 1.0
**最后更新:** 2026-07-22

---

## 开发目标

修复无项目首页默认应用重复渲染，并建立 Agent 消息展示过滤边界，确保所有用户窗体只显示最终可见回复。

---

## 文件级改动范围

### 必改

- `packages/web/src/app/page.tsx`
- `packages/web/src/store/dockStore.ts`
- `packages/core/src/lib/integrations/pi-agent/display-content.ts`
- `packages/core/src/lib/integrations/pi-agent/__tests__/display-content.test.ts`
- `packages/web/src/app/api/agent/sessions/[sessionId]/messages/route.ts`
- `packages/web/src/app/api/agent/projects/[projectId]/messages/route.ts`

### 视实际渲染路径调整

- `packages/web/src/components/skills/SkillDialog.tsx`
- `packages/web/src/components/os/agent-dialog/AgentDialogContent.tsx`
- `packages/web/src/components/interview/CUIDialogPanel.tsx`
- `packages/web/src/components/ui/chat-message.tsx`
- `packages/web/src/components/ui/chat/ChatMessageList.tsx`

### 测试

- `packages/web/src/store/__tests__/dockStore.test.ts` 或现有 store 测试位置
- `packages/web/src/app/__tests__/home-page-empty-state.test.tsx` 或现有页面测试位置
- `packages/web/src/app/api/agent/**/__tests__/*`
- Playwright 首页 smoke 测试（如项目已有 e2e 目录）

---

## 实施步骤

### 步骤 1: 首页默认应用渲染去重

- 从 `WelcomeSection` 中移除内嵌 `HOME_APPS.map(...)`，或让其通过 prop 控制且无项目时不重复。
- 保留 `onCreateProject` 和 `onSkillLaunch` 的可用入口。
- 确认 `data-tour="welcome-apps"` 和 `data-tour="apps-section"` 不同时指向重复应用列表；如 onboarding 依赖该 marker，需要迁移到唯一应用区。

### 步骤 2: 工作区入口空项目行为

- 当前 `open-workspace` 使用 `projects[0]`。无项目时应禁用、提示先创建项目，或改为打开空工作区窗口。
- 推荐短期方案：无项目时显示非阻塞提示并引导创建项目；不创建隐式项目。

### 步骤 3: Dock merge 幂等

- 提取 `dedupeDockApps(apps)` 小函数，按 `id` 和 `skillName` 去重。
- 在 `merge` 中先清理 persisted apps，再补齐 default apps。
- 在 `addApp` 或 AppCard pin 入口处复用相同去重规则，避免运行时点击重复 pin。

### 步骤 4: 建立 Agent display sanitizer

- 在 core Pi Agent display 层提供统一函数，返回仅供 UI 展示的内容。
- 修改 `extractDisplayContent` 默认行为：不从 thinking-only content 回退展示。
- 对 provider thinking 标签做全局剥离。

### 步骤 5: API route 输出过滤

- SSE 仍可内部累积 thinking，但不得发送给客户端。
- 保存 assistant message 时若需要内部 metadata，必须保证读取给 UI 的路径过滤；如果没有明确内部需求，直接不保存 `metadata.thinking`。
- 项目 agent route 和 session route 保持一致。

### 步骤 6: UI 历史消息过滤

- SkillDialog、AgentDialogContent、CUI 面板渲染历史消息前调用 sanitizer。
- 对缺失可见内容的 assistant message，显示空状态，不显示 thinking。

### 步骤 7: 验证

- 跑 core display-content 单元测试。
- 跑 dock store merge 单元测试。
- 跑首页无项目组件或 e2e 测试。
- 跑相关 lint。

---

## 兼容策略

- 不迁移历史会话文件。
- 对旧 persisted Dock 数据读取时去重。
- 对旧 message metadata 读取时过滤。
- 不改变 Agent 内部认知系统、Memory、Dream、Practice Log 的数据保留策略。

---

## 审查要点

- 任何用户可见路径都不能回退显示 thinking。
- 不因过滤 thinking 影响最终文本流式输出。
- 无项目和有项目两种首页状态都只展示一套默认应用。
- Dock 独立窗口和主窗口状态一致。
- 不新增 AGENTS.md 禁止的依赖或样式方案。

---

## 已知风险

- 如果某些调试工具依赖 `metadata.thinking` 展示，需要改为显式 debug 开关，而不是默认 UI 展示。
- Onboarding tour marker 可能依赖 Welcome 内应用区，需要迁移 selector。
- 已存在 localStorage 重复数据会在 hydrate 后被清理，用户可能看到 Dock 顺序轻微变化。
