# Epic A2UI: 生成式交互卡片协议

**Epic 编号:** A2UI  
**Epic 名称:** Agent-to-UI 生成式交互卡片协议  
**优先级:** 🟠 High  
**状态:** 📋 Planning  
**创建日期:** 2026-07-06  
**范围说明:** 本 Epic 仅做规划，不包含实现。

---

## 📋 概述

当前聊天 UI 主要承载 Markdown 文本，适合解释、代码块和列表，但不适合承载 Agent 运行中生成的结构化交互界面。例如 ECharts 图表、报价表、确认卡、参数表单、进度状态和多 Agent 协作结果都需要更明确的协议边界，避免把复杂 UI 伪装成 Markdown 扩展。

本 Epic 规划一套 **A2UI（Agent-to-UI）协议**：Agent 通过结构化 payload 声明交互卡片，前端通过受控组件注册表渲染，用户操作再以结构化事件回传给 Agent 或协作运行时。

### 设计立场

- Markdown 继续作为普通文本表达层。
- A2UI 作为结构化生成式交互层，不把任意 HTML / JSX / JavaScript 暴露给 Agent。
- ECharts 作为 A2UI 的一种 `chart.echarts` 卡片类型，而不是 Markdown 渲染器的特例。
- UI 卡片必须可降级：不支持或校验失败时展示 `fallbackMarkdown`。

---

## 🎯 Epic 目标

1. **定义 A2UI v1 协议**：明确卡片 envelope、组件类型、数据、动作、布局、fallback 与版本兼容策略。
2. **建立受控组件注册表**：只允许渲染白名单组件，禁止 Agent 注入任意前端代码。
3. **支持生成式交互卡片**：覆盖图表、表格、指标、表单、确认选择、状态进度等高频场景。
4. **打通操作回路**：用户在卡片上的点击、选择、提交等动作可作为结构化事件回到 Agent。
5. **补齐治理能力**：协议校验、安全限制、错误降级、测试基线、可观测性与文档示例完整。

---

## 🚫 非目标

- 不在本 Epic 中实现任意 UI 组件或运行时代码。
- 不支持 Agent 直接输出 HTML、React 组件、CSS、脚本或函数。
- 不把 A2UI 设计成插件市场或动态远程组件加载系统。
- 不替代 Markdown；A2UI 与 Markdown 并存。
- 不要求首版覆盖所有可视化场景，首版只定义可演进的协议和基础卡片集。

---

## 🧩 A2UI v1 协议草案

A2UI payload 可来自结构化消息字段，也可在 Markdown 中以受控 fenced block 作为过渡形态：

```a2ui
{
  "version": "a2ui/v1",
  "id": "quote-cost-chart-001",
  "kind": "card",
  "component": "chart.echarts",
  "title": "成本构成",
  "props": {
    "option": {
      "series": []
    }
  },
  "actions": [
    {
      "id": "inspect-material-cost",
      "type": "event",
      "label": "查看材料明细"
    }
  ],
  "fallbackMarkdown": "成本构成图表暂不可渲染，请查看文本摘要。"
}
```

### Envelope 字段

| 字段 | 必填 | 说明 |
|------|------|------|
| `version` | 是 | 协议版本，首版固定 `a2ui/v1` |
| `id` | 是 | 单条消息内稳定唯一 ID，用于事件回传与渲染追踪 |
| `kind` | 是 | `card` / `cardGroup` / `inline`，首版以 `card` 为主 |
| `component` | 是 | 受控组件类型，如 `chart.echarts` |
| `title` | 否 | 卡片标题，由渲染器按组件规则展示 |
| `props` | 是 | 组件输入，必须通过对应 schema 校验 |
| `actions` | 否 | 用户可触发动作列表 |
| `layout` | 否 | 尺寸、密度、响应式偏好，不允许任意 CSS |
| `fallbackMarkdown` | 是 | 不支持或校验失败时展示的文本降级内容 |
| `metadata` | 否 | 会话、agent、trace、来源等非渲染信息 |

---

## 🏗️ 架构边界

### 规划落点

| 层级 | 规划职责 |
|------|----------|
| `packages/core/src/modules/a2ui/` | 协议类型、schema、组件注册表、事件类型、纯函数校验 |
| `packages/web/src/components/a2ui/` | A2UI 卡片渲染器与基础卡片组件 |
| `packages/core/src/modules/collaboration-runtime/ui/` | 多 Agent UI 对 A2UI 渲染器的依赖注入与消息接入 |
| `packages/core/src/lib/integrations/pi-agent/` | Agent 输出规范、prompt 指南与事件回传适配 |
| `docs/specs/epic-A2UI/` | 本 Epic 与 Story 规划 |

### 依赖约束

- A2UI schema 与事件类型必须是纯 TypeScript 数据结构，不依赖 React。
- 渲染器只能依赖协议类型和受控组件注册表，不能反向依赖 Agent 内部实现。
- Agent 事件回传必须通过现有会话/协作运行时通道，不允许卡片直接调用工具。
- ECharts option 必须通过安全 schema 或清洗器处理，禁止函数、脚本、URL 注入和超大数据载荷。

---

## 📝 Stories 列表

| Story | 标题 | 优先级 | 状态 | 文档 |
|-------|------|--------|------|------|
| **A2UI.1** | A2UI v1 协议与组件注册表 | 🔴 Critical | 📋 Planning | [story-A2UI.1/README.md](./story-A2UI.1/README.md) |
| **A2UI.2** | 聊天消息渲染接入与 Markdown 降级 | 🔴 Critical | 📋 Planning | [story-A2UI.2/README.md](./story-A2UI.2/README.md) |
| **A2UI.3** | 首批生成式交互卡片组件集 | 🟠 High | 📋 Planning | [story-A2UI.3/README.md](./story-A2UI.3/README.md) |
| **A2UI.4** | 卡片动作事件回路与 Agent 协议 | 🟠 High | 📋 Planning | [story-A2UI.4/README.md](./story-A2UI.4/README.md) |
| **A2UI.5** | 安全治理、测试基线与可观测性 | 🟡 Medium | 📋 Planning | [story-A2UI.5/README.md](./story-A2UI.5/README.md) |

---

## ✅ Epic 验收标准

- [ ] A2UI v1 协议字段、版本策略、组件命名规范和 payload 示例完成文档化。
- [ ] 明确聊天消息中 A2UI 与 Markdown 的共存、识别、渲染、降级规则。
- [ ] 首批卡片组件的输入 schema、视觉职责、交互职责和边界完成 Story 规划。
- [ ] 用户动作事件的 payload、幂等、错误重试、会话绑定和 Agent 回传策略完成规划。
- [ ] 安全限制、数据大小限制、ECharts option 清洗、测试策略和观测指标完成规划。
- [ ] `docs/index.md` 和 `docs/changes/changelog.md` 已同步更新。

---

## 🔗 相关模块

- [Epic OS: OS 交互基础](../epic-OS/README.md)
- [Epic P2: AI 解决方案设计](../epic-P2/README.md)
- [Epic 9: Multi-Agent 协作运行时](../epic-9/README.md)
- [Epic M: Memory Core 记忆核心](../epic-M/README.md)

---

## 🔄 变更历史

| 日期 | 变更内容 | 变更人 |
|------|----------|--------|
| 2026-07-06 | 新增 Epic A2UI 规划，用 A2UI 协议承载生成式交互卡片与 ECharts 等结构化 UI | AI |
