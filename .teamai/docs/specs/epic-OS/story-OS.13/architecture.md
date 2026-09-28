# 架构设计 - Story OS.13

**Story:** 统一 Agent 记忆使用路径并移除 Dream 主路径
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 技术栈

| 技术 | 用途 | 说明 |
|------|------|------|
| TypeScript | 记忆管理 | 上下文装载逻辑 |
| memory-core | 长期记忆整理 | Epic M 提供的 consolidation pipeline |
| LLM | 上下文压缩 | 消息历史压缩与摘要 |

---

## 数据结构

### 三层记忆模型

```typescript
// 热记忆（Hot Memory）- 默认进上下文
interface HotMemory {
  identity: string;              // Agent 身份
  tools: Tool[];                 // 工具规则
  projectContext: ProjectContext; // 项目基础上下文
  coreMemory: string;            // Memory.md 核心稳定记忆块
  knowledgeSnapshot: string;     // Knowledge.md 精简快照
  patternsSnapshot: string;      // Patterns.md 精简快照
  recentMessages: Message[];     // 最近若干轮消息历史
  recentTrace: ExecutionTrace;   // 最近完整执行轨迹
}

// 温记忆（Warm Memory）- 可自动补充，但不进 system prompt
interface WarmMemory {
  currentTaskSummary: string;    // 当前任务摘要
  relevantRecallResults: RecallResult[]; // 与当前 query 高相关的 Recall 结果
  localPatterns: Pattern[];      // 当前会话内局部相关的归档 pattern
}

// 冷记忆（Cold Memory）- 通过 memory 工具主动检索
interface ColdMemory {
  olderHistory: Message[];       // 更早轮次 history
  archivalContent: ArchivalItem[]; // archival / pattern / reflection 长尾内容
  backgroundKnowledge: Knowledge[]; // 低频业务背景知识
}
```

### 执行轨迹（Recent Trace）

```typescript
interface ExecutionTrace {
  userRequest: string;           // 最近用户请求
  assistantDecision: string;     // 最近助手决策
  toolCalls: ToolCall[];         // 最近 tool 调用
  toolResults: ToolResult[];     // 最近 tool 结果
  failures: Failure[];           // 最近失败原因
  corrections: Correction[];     // supervisor 纠偏指令
  constraints: Constraint[];     // 禁止重复约束
}

interface ToolCall {
  toolName: string;
  parameters: Record<string, unknown>;
  timestamp: number;
}

interface ToolResult {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  timestamp: number;
}

interface Failure {
  toolName: string;
  reason: string;
  timestamp: number;
}

interface Correction {
  from: 'supervisor' | 'user';
  message: string;
  timestamp: number;
}

interface Constraint {
  type: 'no_repeat' | 'avoid_action' | 'require_action';
  description: string;
  timestamp: number;
}
```

### 上下文装载配置

```typescript
interface ContextLoadingConfig {
  // System Prompt 装载内容
  systemPrompt: {
    identity: boolean;           // Agent 身份
    tools: boolean;              // 工具列表
    coreMemory: boolean;         // Memory.md 核心记忆
    knowledgeSnapshot: boolean;  // Knowledge.md 快照
    patternsSnapshot: boolean;   // Patterns.md 快照
  };
  
  // Messages 装载内容
  messages: {
    recentTurns: number;         // 最近轮次数
    includeRecentTrace: boolean; // 是否包含完整执行轨迹
    maxTraceAge: number;         // 执行轨迹最大保留时间（秒）
  };
  
  // 压缩策略
  compression: {
    preserveRecentTrace: boolean; // 压缩时保留最近执行轨迹
    preserveFailures: boolean;    // 保留最近失败信息
    preserveConstraints: boolean; // 保留禁止重复约束
    maxRecallInSystem: number;    // system prompt 中 Recall 最大数量（应为 0）
  };
}
```

---

## 模块设计

### Agent Launcher 模块

**文件：** 
- `packages/core/src/lib/features/services/launcher/agent.ts`
- `packages/core/src/lib/features/services/launcher/project.ts`
- `packages/core/src/lib/features/services/launcher/skill.ts`
- `packages/core/src/lib/features/services/launcher/role-agent.ts`

**职责：**
- 定义各类 Agent 启动时的上下文装载边界
- 明确哪些内容进入 system prompt，哪些进入 messages
- 确保所有 Launcher 使用一致的记忆分层规则

**核心逻辑：**

```typescript
// agent.ts
export async function launchAssistant(config: LaunchConfig): Promise<Agent> {
  // 1. 加载热记忆
  const hotMemory = await loadHotMemory(config);
  
  // 2. 构建 system prompt（只包含热记忆的稳定部分）
  const systemPrompt = buildSystemPrompt({
    identity: hotMemory.identity,
    tools: hotMemory.tools,
    coreMemory: hotMemory.coreMemory,
    knowledgeSnapshot: hotMemory.knowledgeSnapshot,
    patternsSnapshot: hotMemory.patternsSnapshot,
    // 不包含 Recall 结果
  });
  
  // 3. 构建 messages（包含最近对话 + 完整执行轨迹）
  const messages = buildMessages({
    recentMessages: hotMemory.recentMessages,
    recentTrace: hotMemory.recentTrace,
  });
  
  // 4. 启动 Agent
  return createAgent({ systemPrompt, messages, config });
}
```

### Collaboration Runtime 模块

**文件：** `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts`

**职责：**
- 多 Agent 子进程的上下文装载
- 压缩策略调整，保护 Recent Trace
- 移除 Recall 注入 system prompt 的逻辑

**核心变更：**

```typescript
// 移除前
const systemPrompt = buildSystemPrompt({
  // ...
  recallResults: recallResults, // ❌ 移除
});

// 移除后
const systemPrompt = buildSystemPrompt({
  // ...
  // 不再包含 Recall 结果
});

// 压缩前标记 Recent Trace
function markRecentTrace(messages: Message[]): Message[] {
  return messages.map(msg => ({
    ...msg,
    metadata: {
      ...msg.metadata,
      isRecentTrace: isRecent(msg.timestamp),
      isFailure: msg.type === 'tool_result' && !msg.success,
      isConstraint: msg.type === 'constraint',
    },
  }));
}

// 压缩时保留 Recent Trace
function compressMessages(messages: Message[], config: CompressionConfig): Message[] {
  const marked = markRecentTrace(messages);
  
  // 优先保留标记的消息
  const preserved = marked.filter(msg => 
    msg.metadata.isRecentTrace ||
    msg.metadata.isFailure ||
    msg.metadata.isConstraint
  );
  
  // 压缩其余消息
  const compressed = await llmCompress(marked.filter(msg => !preserved.includes(msg)));
  
  return [...preserved, ...compressed];
}
```

### Pi-Agent Core 模块

**文件：** `packages/core/src/lib/integrations/pi-agent/core/agent.ts`

**职责：**
- 单 Agent 运行时的上下文装载
- 压缩行为调整

**核心变更：**

```typescript
// 压缩策略
export async function compressHistory(
  messages: Message[],
  config: CompressionConfig
): Promise<Message[]> {
  // 1. 标记 Recent Trace
  const marked = markRecentTrace(messages);
  
  // 2. 保留最近执行轨迹
  const recentTrace = marked.filter(msg => 
    msg.metadata.isRecentTrace && 
    (Date.now() - msg.timestamp) < config.maxTraceAge
  );
  
  // 3. 保留失败和约束
  const failures = marked.filter(msg => msg.metadata.isFailure);
  const constraints = marked.filter(msg => msg.metadata.isConstraint);
  
  // 4. 压缩其余消息
  const toCompress = marked.filter(msg => 
    !recentTrace.includes(msg) &&
    !failures.includes(msg) &&
    !constraints.includes(msg)
  );
  
  const compressed = await llmCompress(toCompress);
  
  return [...recentTrace, ...failures, ...constraints, ...compressed];
}
```

### RoleAgent System Prompt 模块

**文件：** `packages/core/src/lib/integrations/pi-agent/role-agent/system-prompt.ts`

**职责：**
- RoleAgent 的 system prompt 构建
- 长期记忆装载边界

**核心变更：**

```typescript
export function buildRoleAgentSystemPrompt(context: RoleAgentContext): string {
  return [
    // Layer 1: 身份
    context.identity,
    
    // Layer 2: 状态与记忆
    context.currentState,
    context.coreMemory,        // Memory.md 核心记忆
    context.knowledgeSnapshot, // Knowledge.md 快照
    context.patternsSnapshot,  // Patterns.md 快照
    // 不包含 Recall 结果
    
    // Layer 3-7: 其他层
    // ...
  ].join('\n\n');
}
```

### Project Agent Prompt 模块

**文件：** `packages/core/src/lib/integrations/pi-agent/project-agent/project-prompt.ts`

**职责：**
- Project Agent 的 system prompt 构建
- 长期记忆装载边界

**核心变更：**

```typescript
export function buildProjectAgentPrompt(context: ProjectAgentContext): string {
  return [
    // Layer 1: 身份
    context.identity,
    
    // Layer 2: 状态与记忆
    context.currentState,
    context.coreMemory,
    context.knowledgeSnapshot,
    context.patternsSnapshot,
    // 不包含 Recall 结果
    
    // Layer 3-7: 其他层
    // ...
  ].join('\n\n');
}
```

### Persistent Agent Manager 模块

**文件：** `packages/core/src/lib/integrations/pi-agent/persistent-agent-manager.ts`

**职责：**
- 持久化 Project Agent 管理
- memory-core 消费入口

**核心变更：**

```typescript
export class PersistentAgentManager {
  async startAgent(config: PersistentAgentConfig): Promise<PersistentAgent> {
    // 1. 从 memory-core 加载长期记忆
    const longTermMemory = await this.memoryCore.loadMemory(config.agentId);
    
    // 2. 构建上下文（不包含 Recall）
    const context = {
      ...config,
      coreMemory: longTermMemory.coreMemory,
      knowledgeSnapshot: longTermMemory.knowledge,
      patternsSnapshot: longTermMemory.patterns,
    };
    
    // 3. 启动 Agent
    return this.createPersistentAgent(context);
  }
  
  async onSessionEnd(agentId: string, history: Message[]): Promise<void> {
    // 将 history 提交给 memory-core 进行 consolidation
    await this.memoryCore.consolidate(agentId, history);
  }
}
```

### Dream 模块

**文件：** `packages/core/src/lib/integrations/pi-agent/role-agent/dream.ts`

**职责：**
- 原 Dream 长期记忆整理机制
- 本 Story 后退出主路径

**核心变更：**

```typescript
// 移除前
export async function onTurnEnd(turn: Turn): Promise<void> {
  // ...
  if (turnCount % 20 === 0) {
    await dream(memoryTracker); // ❌ 移除
  }
}

// 移除后
export async function onTurnEnd(turn: Turn): Promise<void> {
  // ...
  // Dream 不再作为主路径调用
  // 长期记忆整理由 memory-core consolidation pipeline 负责
}

// Dream 保留为内部实现（可选）
export async function dreamInternal(memoryTracker: MemoryTracker): Promise<void> {
  // 仅在手动触发时使用
  // 不再自动调用
}
```

### Memory Tracker 模块

**文件：** `packages/core/src/lib/integrations/pi-agent/role-agent/memory-tracker.ts`

**职责：**
- 记忆跟踪器
- 停止向 Memory.md 追加 turn 流水摘要

**核心变更：**

```typescript
// 移除前
export async function flushMemory(): Promise<void> {
  const summary = await summarizeRecentTurns();
  await appendToMemoryMd(summary); // ❌ 移除
}

// 移除后
export async function flushMemory(): Promise<void> {
  // 不再追加 turn 级流水摘要
  // Memory.md 只保留长期稳定认知
  // 长期记忆整理由 memory-core 负责
}
```

---

## 代码变更

### 修改文件

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| MODIFY | `packages/core/src/lib/features/services/launcher/agent.ts` | Assistant 入口的长期记忆与默认上下文装载边界 |
| MODIFY | `packages/core/src/lib/features/services/launcher/project.ts` | Project 入口的长期记忆与默认上下文装载边界 |
| MODIFY | `packages/core/src/lib/features/services/launcher/skill.ts` | Skill 入口的长期记忆与默认上下文装载边界 |
| MODIFY | `packages/core/src/lib/features/services/launcher/role-agent.ts` | RoleAgent 入口的长期记忆与默认上下文装载边界 |
| MODIFY | `packages/core/src/modules/collaboration-runtime/sandbox/agent-worker.mts` | 调整多 Agent 压缩与 Recall 注入策略 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/core/agent.ts` | 单 Agent 运行时上下文装载与压缩行为 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/role-agent/system-prompt.ts` | 长期记忆装载边界 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/project-agent/project-prompt.ts` | 项目 Agent 长期记忆装载边界 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/persistent-agent-manager.ts` | persistent project agent 的 memory-core 消费入口 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/role-agent/dream.ts` | Dream 退出主路径或降级为内部实现 |
| MODIFY | `packages/core/src/lib/integrations/pi-agent/role-agent/memory-tracker.ts` | 停止向 `Memory.md` 追加 turn 流水摘要 |
| MODIFY | `docs/design/memory-core.md` | 与 Epic M 对齐新的记忆层级模型 |

---

## 建议交付顺序

| PR | 范围 | 价值 |
|----|------|------|
| PR-A | 停止 Recall 注入 system prompt，保护 Recent Trace | 先止血 loop 问题 |
| PR-B | 移除 Dream 主路径接线，OS 层只消费 memory-core | 清理重叠机制 |
| PR-C | 单 Agent / 多 Agent 统一上下文装载规则 | 行为一致化 |
| PR-D | loop detector 与长会话回归测试 | 稳定性验证 |

---

## 实施清单

### Phase 1: 先止血

- [x] 删除多 Agent `agent-worker.mts` 中将 Recall 摘要写入 system prompt 的逻辑
- [x] 压缩前先标记并保留最近完整执行轨迹：
  - 最近 user request
  - 最近 assistant 决策
  - 最近 tool call / tool result
  - 最近失败原因 / 禁止重复约束
- [x] 为单 Agent 与多 Agent 增加调试日志，输出压缩前后保留的 Recent Trace 段数

### Phase 2: 统一上下文边界

- [x] 先建立启动链路接入矩阵，至少覆盖：
  - `project` → `ProjectLauncher`
  - `agent` → `AgentLauncher`
  - `skill` → `SkillLauncher`
  - `role-agent` → `RoleAgentLauncher`
  - `persistent project agent` → `persistentAgentManager`
  - `multi-agent` → `agent-worker.mts`
- [x] RoleAgent / ProjectAgent / collaboration worker 统一 system prompt 装载规则
- [x] 将 Recall 检索结果改为普通补充上下文，而不是 system 层
- [x] 将"当前任务摘要"从长期记忆中剥离为运行时工作摘要

### Phase 3: 移除 Dream 主路径

- [x] 停止 OS 层 turn_end / 周期任务对 Dream 的主动调用
- [x] 保留兼容壳或迁移钩子，直到 Epic M / Story M.11 的 consolidation 接入完成
- [x] 清理 RoleAgent / 多 Agent 运行时对 Dream 的默认依赖说明

### Phase 4: 稳定性验证

- [x] 构造长会话回归样例，覆盖：
  - 重复工具失败
  - 多 Agent 协作纠偏
  - recall 命中旧计划
- [x] 验证压缩后不再反复调用同一工具链
- [x] 验证 recent trace 在压缩后仍然可见

---

## 相关文档

- [需求规格](./requirements.md)
- [测试策略](./testing.md)
- [Story OS.13 README](./README.md)
- [Story OS.7 — Agent 托管服务](../story-OS.7/README.md)
- [Epic M / Story M.11 — memory-core consolidation](../../epic-M/story-M.11/README.md)
