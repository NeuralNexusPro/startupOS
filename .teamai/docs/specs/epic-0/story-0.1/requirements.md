# 需求文档 - Story 0.1

**Story:** pi-agent-core集成基础
**版本:** 1.0
**最后更新:** 2026-03-02

---

## 📋 功能需求

### 来源

从以下文档提取：
- PRD: NFR7 - 系统必须支持 Claude Code 集成
- Epic 0: 技术架构实施层 - Pi Agent 核心调度系统
- Architecture: 架构待办 - 需要将 OpenClaw 中的 Pi Agent 核心架构植入到 OriginOS 中

### 详细需求

#### FR0.1.1: pi-agent-core 包集成

**描述：**
将 `pi-mono/packages/agent` (pi-agent-core) 作为 npm 依赖集成到 OriginOS 项目中，作为核心调度层的基础。

**优先级：** 🔴 Critical

**依赖：**
- 外部依赖: `pi-mono/packages/coding-agent` (@mariozechner/pi-coding-agent) - Agent Session SDK
- 外部依赖: `pi-mono/packages/agent` (@mariozechner/pi-agent-core) - Agent API
- 无前置 Story 依赖（Epic 0 的第一个 Story）

#### FR0.1.2: Agent 生命周期管理

**描述：**
实现 Agent 的基本生命周期管理，包括初始化（init）、启动（start）、停止（stop）三个核心阶段。Agent 必须能够正确管理自身状态，并在各个阶段执行必要的资源分配和清理。

**优先级：** 🔴 Critical

**依赖：**
- FR0.1.1: pi-agent-core 包集成

#### FR0.1.3: 通信协议建立

**描述：**
建立 OriginOS 与 pi-agent-core 之间的通信协议，定义消息格式、事件类型和数据结构。通信协议必须支持双向消息传递和事件订阅机制。

**优先级：** 🔴 Critical

**依赖：**
- FR0.1.2: Agent 生命周期管理

#### FR0.1.4: 配置加载机制

**描述：**
实现配置加载机制，支持从配置文件或环境变量加载 Agent 配置（如 LLM 模型、API 密钥、超时设置等）。配置必须支持开发和生产环境的区分。

**优先级：** 🟡 High

**依赖：**
- FR0.1.1: pi-agent-core 包集成

#### FR0.1.5: 健康检查机制

**描述：**
实现 Agent 健康检查机制，能够检测 Agent 是否正常运行、是否响应、资源使用情况等。健康检查结果可用于监控和故障恢复。

**优先级：** 🟡 High

**依赖：**
- FR0.1.2: Agent 生命周期管理

---

## ✅ 验收标准

### AC1: pi-agent-core 包成功集成

**Given** OriginOS 项目已初始化
**When** 开发者安装 pi-agent-core 依赖
**Then** 包成功安装到 node_modules
**And** TypeScript 可以正确导入 pi-agent-core 的类型定义
**And** 无编译错误或类型错误

**测试数据：**
- 输入: `npm install @mariozechner/pi-coding-agent @mariozechner/pi-agent-core`
- 预期输出: 包安装成功，package.json 中包含依赖项

### AC2: Agent 生命周期正常运行

**Given** OriginOS Agent 服务已创建
**When** 调用 Agent 消息发送方法
**Then** Agent 状态变为 `isStreaming = true`
**And** 消息被正确路由到 Agent 内部

**Given** Agent 正在处理消息
**When** Agent 发出 `agent_end` 或 `message_end` 事件
**Then** Agent 状态变为 `isStreaming = false`
**And** 消息被添加到消息历史

**Given** Agent 正在运行
**When** 调用 abort() 方法
**Then** Agent 中断当前操作
**And** 状态重置为 `isStreaming = false`

**测试数据：**
- 输入:
  ```typescript
  const service = new OriginOSAgentService(config);
  await service.sendMessage('Hello');
  ```
- 预期输出:
  - 事件序列: `turn_start` → `message_start` → `message_update`* → `message_end` → `agent_end`
  - `service.getState().messages.length` 增加
  - `service.isStreaming()` 最终为 false

### AC3: 通信协议正常工作

**Given** OriginOS Agent 服务已创建
**When** 发送测试消息到 Agent
**Then** Agent 接收到消息（通过 `turn_start` 事件确认）
**And** 消息格式符合 AgentMessage 类型
**And** 消息路由时间 < 100ms

**Given** Agent 处理消息过程中
**When** Agent 发出流式事件
**Then** 订阅者能收到一系列事件：
- `message_start` (开始生成)
- `message_update` (流式更新，可能多个)
- `message_end` (完成)
- `agent_end` (本轮结束)

**测试数据：**
```typescript
// 输入
const service = new OriginOSAgentService(config);
const events: AgentEvent[] = [];
const unsubscribe = service.subscribe((e) => events.push(e));
await service.sendMessage('Hello Agent');

// 预期输出
events[0].type === 'turn_start'
events[events.length - 1].type === 'agent_end'
service.getState().messages[0].role === 'user'
```

### AC4: 配置加载正确

**Given** 配置文件存在于指定路径
**When** Agent 初始化时加载配置
**Then** 配置参数被正确读取
**And** 必需的配置项存在（如 LLM 模型、API 密钥）
**And** 可选配置项使用默认值

**Given** 配置文件不存在或格式错误
**When** Agent 初始化时加载配置
**Then** 抛出清晰的错误信息
**And** 错误信息指明缺失的配置项

**测试数据：**
- 输入: `config.json` 包含 `{ "llmModel": "claude-3-5-sonnet", "apiKey": "sk-xxx" }`
- 预期输出: Agent 使用指定的 LLM 模型和 API 密钥

### AC5: 健康检查可用

**Given** OriginOS Agent 服务已创建
**When** 调用健康检查接口
**Then** 返回 Agent 健康状态对象
**And** 包含运行时长、消息处理数量、流式状态等指标
**And** 健康检查响应时间 < 50ms

**Given** Agent 正在处理消息时
**When** 调用健康检查接口
**Then** 返回状态中 `isStreaming` 为 true
**And** `pendingToolCalls` 显示待执行的工具数量

**测试数据：**
```typescript
// 输入
const service = new OriginOSAgentService(config);
const health = service.getHealth();

// 预期输出
health.isHealthy === true
health.isStreaming === false
health.messageCount === 0
health.uptime > 0
```

---

## 🔍 边界条件

### 正常场景

1. **场景 1: 首次初始化 Agent**
   - 输入: 调用 `agent.init()` 且配置文件完整
   - 输出: Agent 成功初始化，状态为 "initialized"，日志记录初始化成功

2. **场景 2: 发送简单消息**
   - 输入: `{ type: "user_message", content: "Hello", sessionId: "session-001" }`
   - 输出: Agent 接收消息，返回确认事件，消息被正确路由

3. **场景 3: 正常停止 Agent**
   - 输入: Agent 运行中，调用 `agent.stop()`
   - 输出: Agent 优雅关闭，清理所有资源，状态变为 "stopped"

### 异常场景

1. **异常 1: pi-agent 包未安装**
   - 触发条件: 尝试导入 pi-coding-agent 或 pi-agent-core 但包不存在
   - 错误处理: 抛出 ModuleNotFoundError
   - 用户提示: "pi-coding-agent 或 pi-agent-core 未安装，请运行 npm install @mariozechner/pi-coding-agent @mariozechner/pi-agent-core"

2. **异常 2: 配置文件缺失必需项**
   - 触发条件: 配置文件中缺少 llmModel 或 apiKey
   - 错误处理: 初始化失败，抛出 ConfigurationError
   - 用户提示: "配置错误：缺少必需的配置项 'llmModel'，请检查配置文件"

3. **异常 3: Agent 初始化超时**
   - 触发条件: Agent 初始化时间超过 5 秒
   - 错误处理: 取消初始化，清理部分资源
   - 用户提示: "Agent 初始化超时，请检查网络连接和 LLM API 可用性"

4. **异常 4: 消息格式错误**
   - 触发条件: 发送的消息缺少必需字段（如 type 或 sessionId）
   - 错误处理: 拒绝消息，返回错误事件
   - 用户提示: "消息格式错误：缺少必需字段 'sessionId'"

5. **异常 5: Agent 已停止时接收消息**
   - 触发条件: Agent 状态为 "stopped" 时尝试发送消息
   - 错误处理: 拒绝消息，记录警告日志
   - 用户提示: "Agent 未运行，无法处理消息"

### 边界值

- **初始化超时**: 最大 5 秒，默认 3 秒
- **消息大小**: 最大 10MB，默认无限制（MVP 阶段）
- **并发消息**: 最大 10 个，默认 5 个
- **会话 ID 长度**: 最小 1 字符，最大 128 字符
- **空值处理**:
  - 空消息内容: 拒绝并返回错误
  - 空配置: 使用默认配置
  - 空会话 ID: 自动生成新会话 ID

---

## 🔗 依赖关系

### 前置依赖

| Story | 依赖内容 | 状态 |
|-------|---------|------|
| 无 | Story 0.1 是 Epic 0 的第一个 Story，无前置依赖 | N/A |

**外部依赖：**
- `pi-mono/packages/coding-agent` (@mariozechner/pi-coding-agent): Agent Session SDK (createAgentSession, SessionManager)
- `pi-mono/packages/agent` (@mariozechner/pi-agent-core): Agent API (Agent, AgentMessage, AgentTool)
- Node.js >= 18.0.0
- TypeScript >= 5.0.0

### 后续依赖

| Story | 依赖内容 | 影响 |
|-------|---------|------|
| Story 0.2 | CUI 与核心调度层连接 | 需要 Story 0.1 提供的 Agent 生命周期管理和通信协议 |
| Story 0.3 | 工具能力注册系统 | 需要 Story 0.1 提供的 Agent 基础架构 |
| Story 0.4 | 意图理解与路由 | 需要 Story 0.1 提供的消息通信机制 |
| Story 0.5 | 会话持久化 | 需要 Story 0.1 提供的会话管理基础 |
| Story 0.6 | 错误处理与恢复 | 需要 Story 0.1 提供的健康检查机制 |

**影响范围：**
Story 0.1 是整个 Epic 0 的基础，所有后续 Story 都依赖于此 Story 的成功实施。如果 Story 0.1 延期或失败，将阻塞整个 Epic 0 的进度。

---

## ⚡ 非功能需求

### 性能要求

根据 AGENTS.md 第 6 章和 Epic 0 性能约束：

- **构造函数执行时间:** < 100ms（OriginOSAgentService 初始化）
- **消息路由时间:** < 100ms（sendMessage() 到事件触发，不含 LLM 响应）
- **健康检查响应时间:** < 50ms（getHealth() 执行时间）
- **并发消息处理:** 支持 Agent 的顺序处理机制（pendingToolCalls 管理）
- **内存使用:** Agent 基础内存占用 < 50MB

### 安全要求

- **API 密钥管理:** API 密钥必须通过环境变量或加密配置文件加载，不得硬编码
- **消息验证:** 所有接收的消息必须经过格式验证和类型检查
- **错误信息:** 错误信息不得泄露敏感信息（如 API 密钥、内部路径）

### 可用性要求

- **错误提示:** 所有错误必须提供清晰的错误信息和建议操作
- **日志记录:** 关键操作（初始化、启动、停止、错误）必须记录日志
- **状态可见:** Agent 状态必须可查询和监控

### 可维护性要求

根据 AGENTS.md 规约：

- **代码规范:**
  - 符合 AGENTS.md 单向依赖原则（Layer 1 组件）
  - 通过 ESLint 和 TypeScript 严格模式检查
  - 禁止使用 `any` 类型
- **文档完整性:**
  - 所有公共 API 必须有 JSDoc 注释
  - 接口定义必须有完整的类型声明
- **测试覆盖率:** > 80%
  - 单元测试覆盖所有核心功能
  - 集成测试覆盖生命周期和通信协议
- **目录结构:**
  - 代码位置: `src/lib/integrations/pi-agent/`
  - 测试位置: `src/lib/integrations/pi-agent/__tests__/`
  - 类型定义: `src/lib/integrations/pi-agent/types.ts`

---

## 📝 需求变更历史

| 日期 | 变更内容 | 变更原因 | 变更人 |
|------|---------|---------|--------|
| 2026-03-02 | 初始版本 | - | TBD |

---

## 🔍 需求审查

### 审查清单

- [x] 需求来源明确 - 来自 Epic 0、PRD NFR7、Architecture 架构待办
- [x] 验收标准清晰可测试 - 5 个 AC，每个都有 Given-When-Then 和测试数据
- [x] 依赖关系已识别 - 外部依赖 pi-agent-core，后续 5 个 Story 依赖此 Story
- [x] 边界条件已定义 - 3 个正常场景、5 个异常场景、边界值定义完整
- [x] 非功能需求已考虑 - 性能、安全、可用性、可维护性要求明确
- [x] 与 PRD 一致 - 符合 NFR7 Claude Code 集成要求
- [x] 与 Epic 对齐 - 完全对齐 Epic 0 的核心目标和架构说明

### 审查记录

| 日期 | 审查人 | 结果 | 备注 |
|------|--------|------|------|
| 2026-03-02 | PM (team-lead) | ✅ Approved | 需求文档已完整填充，可进入设计阶段 |
| 2026-03-03 | Architect | ✅ Approved (有条件) | 修复包名错误，验收标准需与实际 API 对齐 |

---

## 📌 相关文档

- [Story README](./README.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [PRD](../../../_bmad-output/planning-artifacts/prd.md)
- [Epic 0](../../../_bmad-output/planning-artifacts/epics.md#epic-0)
