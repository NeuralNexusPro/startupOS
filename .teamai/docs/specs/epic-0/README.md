# Epic 0: 技术架构实施层

**Epic 编号:** 0
**Epic 名称:** 技术架构实施层 - Pi Agent 核心调度系统
**优先级:** 🔴 Critical (基础设施，必须优先实施)
**状态:** In Progress（Story 0.7 Verification）
**负责人:** -
**开始日期:** 2026-03-02

---

## 📋 Epic 描述

引入 `pi-mono/packages/agent` (pi-agent-core) 作为 OriginOS 的核心调度层，承接 CUI 上用户的所有会话和意图，调用对应的 Skills 与能力来完成用户指令。

这个 Epic 是所有后续 Epics 的基础设施，必须在其他 Epics 开始之前完成。

---

## 🎯 Epic 目标

### 核心目标

1. **核心调度层集成**: 将 pi-agent-core 无缝集成到 OriginOS 中作为智能调度中枢
2. **会话管理**: 管理所有用户会话、消息历史和上下文
3. **意图理解**: 通过 LLM 解析用户意图并映射到对应的能力和技能
4. **能力调度**: 动态发现和调用系统的各种能力（Skill、Tool）
5. **事件流处理**: 提供实时的事件流接口用于 UI 更新

### 成功标准

- ✅ pi-agent-core 成功集成到 OriginOS，可以作为独立模块使用
- ✅ CUI 可以通过核心调度层发送用户消息
- ✅ 核心调度层可以将用户消息转换为 LLM 理解的内容
- ✅ 核心调度层可以调用各种能力（文件操作、本体管理等）
- ✅ UI 可以实时接收和处理来自核心调度层的事件
- ✅ 会话状态可以持久化和恢复

---

## 🏗️ 架构说明

### Epic 0 在 architecture.md 中的位置

```
┌─────────────────────────────────────────────────────────────┐
│                    OriginOS 架构                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  UI Layer (CUI, Editor, GraphViewer, etc.)         │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     ↓                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Epic 0: 技术架构实施层                           │   │
│  │  ┌─────────────────────────────────────────────┐   │   │
│  │  │  pi-agent-core (核心调度层)                 │   │   │
│  │  │  - 会话管理                                    │   │   │
│  │  │  - 消息转换                                   │   │   │
│  │  │  - 意图理解                                   │   │   │
│  │  │  - 能力调度                                   │   │   │
│  │  │  - 事件流                                     │   │   │
│  │  └─────────────────────────────────────────────┘   │   │
│  └──────────────────┬──────────────────────────────────┘   │
│                     ↓                                       │
│  ┌───────────────────┼───────────────────┐                  │
│  │                   ↓                   ↓                  │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │  │ Epic 1      │ │ Epic 2      │ │ Epic 3      │        │
│  │  │ (项目访谈)    │ │ (工作空间)    │ │ (对话交互)    │        │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘        │
│  │         │               │               │                │
│  └─────────┴───────────────┴───────────────┴────────┘        │
│                     ↓                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Core Capabilities (Skills + Tools)                 │   │
│  │  - File Management Skills                           │   │
│  │  - Ontology Management Skills                      │   │
│  │  - Knowledge Graph Skills                          │   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### openclaw 实现架构参考

| openclaw 模块 | OriginOS 对应模块 | 说明 |
|--------------|------------------|------|
| `src/agents/pi-embedded-runner/` | `src/lib/integrations/pi-agent/core/` | 核心运行器实现 |
| `src/agents/pi-tools.ts` | `src/lib/integrations/pi-agent/tools/` | 工具注册和执行 |
| `src/agents/pi-embedded-subscribe.ts` | `src/lib/integrations/pi-agent/core/session.ts` | 事件订阅机制 |
| `src/config/sessions/` | `src/lib/integrations/pi-agent/store.ts` | 会话持久化 |
| `@originos/pi-agent-adapter` | OriginOS workspace 适配层 | 稳定 Agent/AI/Goal 运行时边界 |

**关键实现模式（openclaw 验证）：**
1. 使用 `SessionManager` 管理会话生命周期
2. 通过 `createAgentSession` 创建代理会话
3. 使用 `subscribeEmbeddedPiSession` 订阅事件流
4. 工具通过 `AgentTool` 接口注册
5. 系统提示词通过 `buildSystemPromptParams` 构建

### pi-agent-core 核心能力

| 能力 | 描述 | OriginOS 用途 |
|------|------|--------------|
| **Agent 会话管理** | 管理对话历史、系统提示词、模型配置 | CUI 会话管理 |
| **消息转换** | AgentMessage ↔ LLM Message | 自定义消息类型支持 |
| **工具执行** | AgentTool 注册和执行 | 将 Skill 封装为 Tool |
| **事件流** | 实时事件订阅和广播 | UI 实时更新 |
| **调度循环** | 自动轮询 LLM、执行工具、处理结果 | 意图理解和执行循环 |
| **转向和跟进** | 中断当前操作、排队后续任务 | 用户干预和多步任务 |

### 依赖的关键包

| 包名 | 来源 | 用途 |
|------|------|------|
| `@originos/pi-agent-adapter` | `packages/agent` | OriginOS 稳定适配入口 |
| `@earendil-works/pi-agent-core@0.80.10` | Earendil Works Pi | Agent 核心循环 |
| `@earendil-works/pi-ai@0.80.10` | Earendil Works Pi | LLM 抽象层 |
| `pi-agent-goal@2026.7.18` | Pi 扩展 | Goal 生命周期（产品入口由 Story 9.41 实现） |

---

## 📝 Stories 列表

| Story | 标题 | 状态 | 优先级 |
|-------|------|------|--------|
| 0.1 | pi-agent-core 集成基础 | ✅ Complete | Critical |
| 0.2 | CUI 与核心调度层连接 | ✅ Complete | Critical |
| 0.3 | 工具能力注册系统 | ✅ Complete | Critical |
| 0.4 | 意图理解与路由 | ✅ Complete | High |
| 0.5 | 会话持久化 | ✅ Complete | High |
| 0.6 | 错误处理与恢复 | ✅ Complete | High |
| 0.7 | Pi Runtime 0.80.x 升级与 pi-agent-goal 兼容迁移 | 🟠 Verification | Critical |

---

## 🔗 依赖关系

### 前置依赖
- 无（Epic 0 是基础设施，无前置依赖）

### 后续依赖
| Epic | 依赖内容 |
|------|---------|
| Epic 1 | 使用核心调度层的意图理解进行访谈引导 |
| Epic 2 | 使用核心调度层的工具能力进行文件操作 |
| Epic 3 | 完全依赖核心调度层的会话管理 |
| Epic 4 | 使用核心调度层的本体能力 |
| Epic 5 | 需要核心调度层的 Skill 动态加载 |
| Epic 6 | 依赖核心调度层的事件流进行可视化更新 |

---

## 📊 验收标准

### Epic 级别验收标准

- [ ] 所有 7 个 Stories 完成（6/7 完成；0.7 Verification）
- [x] 通过所有单元测试和集成测试 ✅
- [x] CUI 可以通过核心调度层发送消息 ✅
- [x] 核心调度层可以正确理解并调用能力 ✅
- [x] UI 可以实时显示核心调度层的所有事件 ✅
- [x] 会话状态可以正确保存和恢复 ✅
- [x] 错误可以正确处理并提供恢复建议 ✅
- [x] 符合 AGENTS.md 规约 ✅

---

## 📚 相关文档

### 架构参考（openclaw）
- [openclaw/pi-embedded-runner](../../openclaw/src/agents/pi-embedded-runner/) - OpenClaw 的 pi-embedded-runner 实现
- [openclaw/pi-tools](../../openclaw/src/agents/pi-tools.ts) - OpenClaw 的工具注册实现
- [openclaw/agent-runner](../../openclaw/src/auto-reply/reply/agent-runner.ts) - OpenClaw 的 agent 运行器
- [openclaw/pi-embedded-subscribe](../../openclaw/src/agents/pi-embedded-subscribe.ts) - OpenClaw 的事件订阅实现

### 上游文档
- [AGENTS.md](../../AGENTS.md) - 架构规约
- [pi-agent-core README](../../pi-mono/packages/agent/README.md) - pi-agent-core 文档
- [pi-agent-core types](../../pi-mono/packages/agent/src/types.ts) - pi-agent-core 类型定义

### 关键技术
- **@mariozechner/pi-agent-core**: 核心调度层
- **@mariozechner/pi-ai**: LLM 抽象层
- **@mariozechner/pi-coding-agent**: SessionManager 和 Agent 会话管理

---

## 🔄 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-07-28 | 新增 Story 0.7：Pi Runtime 0.80.x 升级与 pi-agent-goal 兼容迁移 | Codex |
| 2026-03-02 | Epic 0 初始化 | archersado |

---

## 📌 注意事项

### 关键约束

1. **pi-agent-core 依赖**: Epic 0 通过 `@originos/pi-agent-adapter` 使用精确锁定的 Earendil Works Runtime
2. **单向依赖**: 核心调度层作为基础设施，必须符合 AGENTS.md 的单向依赖原则
3. **性能要求**: 所有调度操作必须在 < 100ms 内完成响应
4. **类型安全**: 必须使用 TypeScript 严格模式，禁止 `any` 类型

### 集成策略

1. **渐进式集成**: 先完成基础集成，再逐步添加高级功能
2. **测试驱动**: 每个 Story 必须有完整的单元测试
3. **事件流优先**: 确保事件流接口设计合理，便于 UI 集成
4. **可扩展性**: Tool 注册系统需要支持动态加载

---

## 🎯 下一步行动

1. **实施 Story 0.7**: 迁移 Pi Runtime 至 0.80.10 兼容基线
2. **执行验证 Goal**: 通过 Story 0.7 定义的全部测试 case
3. **解除 Story 9.41 阻塞**: 在兼容基线上实施 Goal 任务入口
