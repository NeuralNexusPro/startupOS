# 需求文档 - Story OS.17

**Story:** 无项目首页与 Agent 思考内容显示优化
**版本:** 1.0
**最后更新:** 2026-07-22

---

## 需求来源

- 用户反馈：没有项目时，默认应用加载器会重复，默认无项目首页还原需要优化。
- 用户反馈：几个窗体仍能看到 Pi Agent 思考的 turn，需要查明原因并给出方案。
- Epic OS：桌面空间、Dock、应用窗口系统和 Agent 托管体验。
- AGENTS.md：首页内置应用配置驱动、Pi Agent 会话交互层、AppWindowManager 多窗体管理。

---

## 详细需求

### FR1: 无项目首页默认应用入口去重

无项目状态下，首页必须只出现一套默认应用启动器。`WelcomeSection` 可以保留欢迎、创建项目和 Spotlight 引导，但不得再重复渲染与主 Home Apps Section 相同的 `HOME_APPS` 列表，或必须通过单一渲染源统一控制。

**优先级:** High

### FR2: 默认应用和 Dock 状态幂等还原

刷新首页、重新进入 Electron 主窗口、Dock 独立窗口同步、本地持久化恢复后，默认应用、pinned apps 和运行态窗口入口不得重复。去重规则必须使用稳定 id，并兼容 `skillName` 相同但 id 历史不一致的旧数据。

**优先级:** High

### FR3: Agent 内部思考内容不可见化

前端用户可见消息只允许显示 assistant 的最终文本、工具摘要和明确设计为用户可见的系统提示。不得显示：

- `thinking_delta` / `thinking_end` 原始内容
- `message.metadata.thinking`
- provider reasoning / `<think>...</think>` 内容
- Pi Agent 事件名，如 `turn_start`、`turn_end`
- 仅用于运行时状态机、Dream、CognitiveManager 的内部 turn 数据

**优先级:** High

### FR4: 历史消息兼容清理

已有会话历史中如果存在 `metadata.thinking` 或 reasoning 标签，UI 层必须过滤展示；存储层是否保留内部 metadata 可由实现决定，但 API 返回给客户端的展示 DTO 必须默认不含思考内容。

**优先级:** Medium

### FR5: 验证覆盖

必须有自动化或脚本化验证证明：

- 无项目首页 `HOME_APPS` 展示数量正确。
- Dock merge 不因 persisted/default 混合产生重复。
- SSE 流不会发送 thinking 内容。
- 历史消息接口或前端渲染不会显示 thinking metadata。

**优先级:** High

---

## 验收标准

### AC1: 无项目首页不重复显示应用启动器

**Given** 项目列表为空且首页完成加载  
**When** 用户进入 `/`  
**Then** 页面只显示一组默认应用卡片  
**And** 每个 `HOME_APPS` id 最多出现一次  
**And** 页面仍提供创建项目、Spotlight 和默认应用入口

### AC2: 有项目首页保持现有应用区

**Given** 项目列表至少包含一个项目  
**When** 用户进入 `/`  
**Then** 页面显示项目桌面和单一应用启动器区域  
**And** 不出现 Welcome 内重复应用区

### AC3: Dock pinned apps 去重

**Given** localStorage 中存在重复的 pinned app，包含相同 `id` 或相同 `skillName` 的旧记录  
**When** `originos-dock-store` hydrate 并合并 `DEFAULT_DOCK_APPS`  
**Then** 合并后的 apps 中同一稳定应用只保留一条  
**And** 默认 pinned app 缺失时只补齐一次

### AC4: SSE 不向客户端发送思考内容

**Given** Pi Agent 产生 `thinking_delta`、`thinking_end`、`message_update` 和最终文本  
**When** `/api/agent/sessions/{sessionId}/messages` 返回 SSE  
**Then** 客户端只收到最终可见文本和允许展示的工具事件  
**And** SSE payload 中不包含 thinking 字段、reasoning 标签或 turn 事件名

### AC5: 历史消息不展示内部思考

**Given** 历史会话中已有 assistant message 包含 `metadata.thinking` 或内容中夹带 `<think>` 标签  
**When** SkillDialog、AgentDialogContent 或项目 Agent 窗体加载历史消息  
**Then** UI 不显示内部思考内容  
**And** 用户只看到最终回答或明确的空状态提示

### AC6: 窗体范围一致

**Given** 用户分别打开内置 skill、用户创建 Agent、RoleAgent、项目访谈/项目 Agent 窗体  
**When** Agent 产生内部思考 turn  
**Then** 所有窗体展示策略一致，不出现某个窗体漏过滤

---

## 边界条件

- 项目加载中：不应提前渲染两套应用启动器。
- 项目接口失败：允许显示恢复性空状态，但不能重复应用列表。
- 用户没有 LLM 配置：保留设置引导，不展示内部错误堆栈。
- 历史脏数据：UI 必须过滤，即使存储里仍有 metadata。
- Electron 独立 Dock 窗口：BroadcastChannel / IPC 同步不能复制重复 app。

---

## 依赖关系

| 依赖 | 内容 | 状态 |
|------|------|------|
| Story OS.9 | 应用窗口系统与 AppWindowManager | Complete |
| Story OS.14 | Agent Runtime 工作目录与输出目录边界 | Complete |
| Story OS.15 | 自动更新机制，与本 Story 无直接实现依赖 | Planning |
| Epic 0 | Pi Agent 核心调度和 SSE 会话基础 | Complete / Existing |

---

## 非功能需求

- 首页首次稳定渲染不超过 AGENTS.md 的首次页面加载约束。
- CUI 消息可见更新仍需保持 < 500ms。
- 不引入数据库，不新增后端框架。
- 不在 `packages/web/src/app/` 新增业务逻辑；API route 只做响应映射和过滤调用。
- TypeScript 严格模式下不得新增 `any` 扩散。
- UI 使用 Tailwind，不新增 CSS Modules 或 Styled Components。
