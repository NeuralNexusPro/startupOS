# 架构设计文档 - Story OS.17

**Story:** 无项目首页与 Agent 思考内容显示优化
**版本:** 1.0
**最后更新:** 2026-07-22

---

## 架构目标

在不改变 Pi Agent 核心运行机制的前提下，收敛桌面首页默认应用渲染源，并在 API/UI 边界建立统一的“用户可见消息”过滤策略。实现应保持现有 App Router、Zustand、AppWindowManager 和 Pi Agent 集成分层。

---

## 已定位原因

### 默认应用重复

- `WelcomeSection` 在 [packages/web/src/app/page.tsx](/mnt/f/workspace/startupOS/packages/web/src/app/page.tsx) 内部渲染 `HOME_APPS.map(...)`。
- 同一页面在 `!isLoadingProjects` 下无条件渲染 Home Apps Section，也渲染 `HOME_APPS.map(...)`。
- 当 `projects.length === 0` 时两个区域同时成立，因此无项目首页重复展示默认应用。

### 思考 turn 可见

- API route 已经对 `thinking_delta` 做静默累积，但 `agentSessionService.addMessage` 仍可能把 `metadata.thinking` 保存进 assistant message。
- 部分历史消息或窗体组件可能直接渲染 message content / metadata，而没有统一调用 display sanitizer。
- `extractDisplayContent` 现有测试允许在特定情况下从单个 thinking block 回退为显示内容；该回退对终端窗体不安全，应限制为调试路径或默认禁用。

---

## 影响模块

| 模块 | 文件 | 变更方向 |
|------|------|----------|
| Web 页面层 | `packages/web/src/app/page.tsx` | 只调整渲染编排，不新增业务逻辑 |
| Web 组件层 | `packages/web/src/components/framework/AppCard.tsx` | 如需，强化 pin 幂等 |
| Web 状态层 | `packages/web/src/store/dockStore.ts` | 强化 persisted/default merge 去重 |
| Web 组件层 | `packages/web/src/components/skills/SkillDialog.tsx` | 历史消息展示过滤 |
| Web 组件层 | `packages/web/src/components/os/agent-dialog/AgentDialogContent.tsx` | 历史消息展示过滤 |
| App Router API 边界 | `packages/web/src/app/api/agent/sessions/[sessionId]/messages/route.ts` | 返回 DTO 过滤，避免发送 thinking |
| App Router API 边界 | `packages/web/src/app/api/agent/projects/[projectId]/messages/route.ts` | 同上 |
| Core 集成层 | `packages/core/src/lib/integrations/pi-agent/display-content.ts` | 提供统一 sanitizer 或默认禁用 thinking fallback |
| 测试 | 相关 `__tests__` / Playwright 测试 | 覆盖去重与过滤 |

---

## 依赖方向

```text
packages/web/src/app/page.tsx
  -> packages/web/src/components/*
  -> packages/web/src/store/*
  -> @originos/core public APIs

packages/web/src/app/api/agent/*
  -> @originos/core/lib/features/*
  -> @originos/core/lib/integrations/pi-agent/*

packages/core/src/lib/integrations/pi-agent/display-content.ts
  -> shared utility/types only
```

符合 AGENTS.md：

- API route 只做事件响应映射和展示过滤，不承载新的业务主实现。
- 过滤函数应优先放在 core Pi Agent 集成层，通过公共 API 被 Web API/UI 使用。
- Web 组件不依赖 desktop main。
- 不修改 `dist-electron`、`.next` 或 `node_modules`。

---

## 推荐方案

### 方案 A: 单一默认应用渲染源

首选做法：

- 保留 WelcomeSection 的欢迎、创建项目和 Spotlight 引导。
- 移除 WelcomeSection 内 `HOME_APPS.map(...)`，让 Home Apps Section 成为唯一默认应用列表。
- 或者增加明确 prop，例如 `showApps={projects.length > 0}`，但默认不建议让两个区域都能渲染同一列表。

### 方案 B: Dock 去重规则统一

在 `dockStore.merge` 中按以下顺序去重：

1. 优先使用 `id` 去重。
2. 对 `skillName` 非空的 skill app，再按 `skillName` 去重。
3. 对缺失的 `DEFAULT_DOCK_APPS` 只补齐一次。
4. 保留用户 pinned 顺序，默认 app 追加在末尾。

### 方案 C: 用户可见消息 sanitizer

在 core Pi Agent 集成层提供或强化函数：

```typescript
sanitizeAgentDisplayMessage(message): AgentDisplayMessage
stripHiddenReasoning(text): string
```

规则：

- 移除 `metadata.thinking` 后再给 UI。
- 移除 `<think>...</think>`、provider reasoning block。
- 不把 `turn_start` / `turn_end` 映射为用户消息。
- `extractDisplayContent` 默认不从 thinking block 回退为可见文本；如调试需要，必须显式传 `allowThinkingFallback: true`。

### 方案 D: API 和 UI 双边界防护

- API route SSE 不发送 thinking payload。
- 历史消息接口或组件渲染前再次 sanitizer。
- UI 组件对未知 metadata 默认忽略，而不是透传渲染。

---

## 数据/API/状态方案

- 不新增持久化数据结构。
- 不迁移历史 JSON 文件。
- 对已有历史数据采用读取时过滤，避免破坏调试和认知系统内部存储。
- Dock store 只调整 hydrate merge 逻辑，不改变 persisted schema。

---

## 性能与安全

- sanitizer 是字符串和对象浅处理，必须保持 O(n)。
- 首页减少重复应用渲染会降低首屏 DOM 数量。
- 过滤 thinking 内容属于隐私和安全加固，避免泄露 prompt、内部状态机、模型推理和工具 trace。

---

## AGENTS.md 符合性

- 使用 Next.js App Router、React、TypeScript、Tailwind、Zustand。
- 不引入 Redux、数据库、后端框架或 CSS Modules。
- 不把业务逻辑放入 `packages/web/src/app/`；通用过滤下沉到 core Pi Agent 集成层。
- 不修改编译产物作为源码入口。
- Story 已在 `testing.md` 中定义自动化验证用例后再进入实现。
