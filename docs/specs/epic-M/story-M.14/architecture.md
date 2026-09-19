# 架构设计文档 - Story M.14

**Story:** 渐进式 Agent 上下文、KV Cache 与 Token 统计
**版本:** 1.0
**最后更新:** 2026-09-18

## 实施结论

| 链路 | 已实施行为 |
|---|---|
| 普通 Agent | stable system 与 session context 分离；后者只含 Core/Stable Memory、有界目录和工作目录。 |
| RoleAgent | 身份、思维循环、工具、风格、权限和安全保持稳定；阶段、Memory、工作目录和认知目录位于 session context。 |
| Project Agent | 复用共享目录与 prompt boundary，不再维护私有目录实现。 |
| 协作 Agent | supervisor/worker 使用相同目录、session 边界和 owner-aware turn prefetch。 |

`CognitiveManager.prefetchContext()` 已接入实际 turn。Pi AI 继续原生处理 provider cache；Core 只传稳定内部 `sessionId` 并保留真实 `usage.cacheRead/cacheWrite`。

## 当前结构

```text
模型请求
├── Stable System Prompt（字节稳定）
│   ├── Identity / invariant operating rules
│   ├── Thinking & collaboration protocol
│   ├── Safety / permission policy
│   └── Compact tool and context-loading protocol
├── Session Context（会话级冻结消息）
│   ├── current phase / project status
│   ├── core memory / user profile / world model
│   ├── working directory
│   └── compact Knowledge/Pattern catalog
├── Existing conversation history
└── Current Turn
    ├── bounded cognitive prefetch results
    └── raw user request
```

前缀稳定依赖“内容和顺序一致”，不是新缓存对象。稳定内容继续使用现有 system prompt；会话快照通过 Pi Agent 已有 context transformation 以冻结的模型侧上下文消息注入，不在每轮调用 `setSystemPrompt()`。实现只调整现有 prompt layers 和上下文转换点，并补一个 system-prompt hash；不创建新的 Prompt Manager。

## 渐进加载

### Level 0：目录

Session Context 只保留有界目录。首版直接复用 Project Agent 已有的 Markdown 标题提取方式；目录只包含标题和按需读取说明，不包含正文。无需新增 registry 读取链路。

### Level 1：turn prefetch

在用户消息进入模型前，使用原始用户任务调用当前会话已有 `CognitiveManager.prefetch(query)`：

1. 各 Provider 在自己的 ownership 边界内检索。
2. 聚合器按固定 Provider 顺序保留各 Provider 已完成的相关度排序。
3. 应用统一总字符预算与每 Provider 上限。
4. 以受控上下文块附加到当前 turn；存储内容按不可信引用处理，不能覆盖 system 指令。

```xml
<originos_recalled_context trust="reference" owner="...">
  ...bounded excerpts...
</originos_recalled_context>
```

该块通过同一个 context transformation 属于当前 turn，不调用 `setSystemPrompt()`，因此不会重写稳定前缀，也不改写持久化的原始用户消息。

### Level 2：完整读取

当摘要不足时，Agent 使用现有 memory/file tools 读取具体 Pattern、Knowledge 页面或源文件。首版不新增 `recall_patterns` 工具；已有 `archival_memory_search`、`read_file` 和 Provider prefetch 足以覆盖。

## 组装顺序

四条 Agent 链路共享以下顺序原则：

1. Identity
2. Invariant operating/thinking/collaboration rules
3. Safety and permission policy
4. Compact toolbox/context-loading protocol
5. Mutable phase and status
6. Core memory/profile/world model
7. Working directory and runtime environment
8. Compact catalogs

第 1–4 项组成稳定 system prompt，第 5–8 项组成会话级冻结上下文。Data.md / Process.md 在发布后的协作方案中是稳定契约，可放入 stable system prompt；运行时 `extraInstructions` 必须留在当前 turn。Tool.md 或技能清单发生实际变化时允许 stable system prompt hash 改变。

## 最小代码边界

- `memory-consumption.ts`：统一生成有界 Knowledge/Pattern 目录，停止全文 section。
- 现有普通/Role/Project/Collaboration prompt builders：复用目录并按稳定/可变顺序组装。
- `CognitiveManager` 及 Agent 生命周期：通过 Pi Agent 已有 context transformation 把 `prefetch()` 接入 turn 前模型上下文，并保持原始消息持久化不变。
- `OriginOSAgent`：向底层 Agent 传递稳定 session id；保持 Pi AI 默认短缓存，只有现有配置明确要求时才改变 retention。
- 事件/usage 路径：记录长度、hash、cacheRead/cacheWrite，不记录内容。

不引入新的 feature package、数据库、向量库或缓存服务。

## 数据与安全

- stable system prompt hash 使用 Node `crypto`，只记录 hash 和长度。
- session cache key 使用内部 session id 的不可逆派生值或已有非敏感 id，禁止使用消息、文件路径、用户邮箱或 IM 标识。
- recalled context 必须绑定现有 `memoryOwnership` / `ObservationContext`。
- 检索内容是参考资料，使用固定边界标记，不能解释为更高优先级指令。
- Prompt/召回正文不得写入诊断日志。

## KV Cache 策略

1. 先保证 provider 无关的精确前缀稳定。
2. 复用 Pi AI 的 provider 适配：Anthropic cache control、OpenAI prompt cache key、Mistral/Bedrock 等由依赖处理。
3. 不直接调用供应商私有 API，不假设缓存必定命中。
4. 以 `usage.cacheRead/cacheWrite` 验证实际效果；不支持时指标为零，不影响功能。

## Token 统计

Pi `AssistantMessage.usage` 已包含真实的 `input`、`output`、`cacheRead`、`cacheWrite`、可选 `reasoning`、`totalTokens` 和分项 cost。当前 Desktop/Web 流式适配只提取文本，持久会话消息也没有 usage，因此历史恢复后无法统计。

最小修复路径：

1. `message_end` 捕获 assistant message 的原始 provider usage。
2. 在 Core `AgentMessage` 上增加可选、provider-neutral 的 usage 字段；随 assistant message 一起写入现有 session JSON，不新增统计文件。
3. Session 详情按消息聚合，旧消息没有 usage 时保持 unavailable。恢复给 Pi runtime 使用的零 usage 不参与用户统计。
4. 同一模型调用记录四个仅含数字的上下文估算：stable system、session context、turn recall、history。复用当前 `chars / 3` 启发式并明确标记 estimated。
5. Desktop/Web 流事件在最终 assistant message 或 done 事件携带 usage；UI 只在消息完成时更新。
6. 协作 worker 把同一真实 usage 送入现有 `CostController` 和 `MetricsRegistry`，扩展 cache 字段并删除 50/50 input/output 成本推算。若 provider 已返回 cost，优先使用；缺失时才沿用现有价目估算。

```typescript
interface AgentTokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  reasoning?: number;
  totalTokens: number;
  cost?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    total: number;
  };
}

interface AgentContextTokenEstimate {
  stableSystem: number;
  sessionContext: number;
  turnRecall: number;
  history: number;
  total: number;
  estimated: true;
}
```

Session 汇总是纯函数，不创建 TokenUsageManager，也不把统计写入 Memory Core。

会话 UI 将该纯函数结果作为宿主消息区上方的可选顶部内容渲染；`ChatMessageList` 只渲染消息、状态和任务内容。没有真实 usage 时不渲染顶部区域，详情继续使用原生 `details/summary` 展示并标记上下文值为估算。

## 性能预算

- system prompt 中 Knowledge/Patterns 正文字符数：0。
- Knowledge 与 Pattern 目录各最多 1,600 字符；turn recall 单 Provider 最多 2,000 字符，含边界的聚合块最多 6,000 字符。
- prefetch 失败或超时不阻塞回复；首版复用 Provider 现有查询，不新增额外 LLM 调用。
- Token 统计不订阅流式 delta；单次 message_end 处理和 session 聚合不增加模型调用。

## 依赖规约证明

- 实现位于 `packages/core` 现有 Memory Core 与 Pi Agent 集成边界。
- Web/Desktop 只消费结果，不承载业务逻辑。
- Memory Core 不反向依赖 launcher、Web 或 Desktop。
- 所有跨 feature 使用公共出口；不修改 `dist-electron` 或运行时数据。
