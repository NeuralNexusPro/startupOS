# Story 9.36 补充说明：项目上下文写入与 Blackboard 共享记忆补全

## 📊 当前状态分析

### 1. 项目上下文写入机制（已实现）

**位置：** `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`

**实现方式：**
```typescript
function buildAgentPrompt(agentId: string, globalGoal: string): string {
  let prompt = globalGoal;

  // 注入上游 Agent 的完成结果
  const dependencies = topology.edges
    .filter((e) => e.to === agentId && e.type === "trigger")
    .map((e) => e.from);

  if (dependencies.length > 0) {
    const upstreamText = dependencies
      .map((depId) => {
        const depAgent = agents.find((a) => a.id === depId);
        const output = upstreamResults.get(depId) ?? "（无输出）";
        return `- 【${depAgent?.name ?? depId}】的产出：\n${output}`;
      })
      .join("\n\n");
    prompt += `\n\n【上游 Agent 产出】\n${upstreamText}\n\n请基于上述上游产出继续执行你的任务。`;
  }

  // 注入 Human-in-the-Loop 审查请求指令
  prompt += `\n\n【人类审查请求】\n...`;

  return prompt;
}
```

**特点：**
- ✅ 从 `upstreamResults` Map 获取上游 Agent 输出
- ✅ 通过 `buildAgentPrompt()` 注入到 Agent 的 prompt
- ❌ **数据来源是本地内存 Map**，不在 Blackboard 中
- ❌ **不可追溯**：没有 provenance 记录谁在何时更新了什么

---

### 2. Blackboard 共享记忆使用情况（部分实现）

**Blackboard 创建：**
- `DagExecutor` 中创建 `new Blackboard(sessionId, snapshotDir)`
- `AgentWorker` 中通过 `loadCollaborationBlackboard()` 加载

**当前使用场景（从 grep 结果分析）：**
- ✅ **测试代码**中大量使用 Blackboard（ACL、Protocol、Supervisor 测试）
- ✅ `AgentWorker` 用于 ACL 消息处理（`readMessages()`, `sendMessage()`）
- ❌ **生产执行路径** 中**没有使用 Blackboard 的 `sharedData`/`read()`/`write()`**

**关键发现：** `multi-agent-executor.ts` 中没有调用 `blackboard.sharedData` 来存储或读取共享记忆！

---

## 🎯 需要补全的机制

### 补全 1：共享 Blackboard 的 `upstreamResults` 存储

**问题：** 当前 `upstreamResults` 存储在进程内存的 `Map<string, string>` 中，导致：
- ❌ 其他进程/Agent 无法访问上游产出
- ❌ 没有事件溯源（Event Sourcing），无法重放
- ❌ 没有 provenance 追踪（谁写的、什么时候写的）

**解决方案：** 将上游产出写入 Blackboard，利用现有的 Event Sourcing 机制

```typescript
// 修改 multi-agent-executor.ts
// 移除本地 Map，改用 Blackboard

// ❌ 旧代码
const upstreamResults = new Map<string, string>();

// ✅ 新代码
class UpstreamResults {
  private blackboard: Blackboard;

  constructor(blackboard: Blackboard) {
    this.blackboard = blackboard;
  }

  /** 上游 Agent 完成时写入 Blackboard */
  writeUpstreamOutput(agentId: string, agentName: string, output: string): void {
    const key = `upstream$${agentId}$output`;
    this.blackboard.write(key, output, {
      writer: agentId,
      timestamp: new Date().toISOString(),
      source_uri: `dag-executor:upstream:${this.blackboard.sessionId}`,
      tags: ["upstream-output"], // 标记为上游产出
    });

    // 同时写入上游元数据（方便查询）
    const metaKey = `meta$upstream$${agentId}`;
    this.blackboard.write(metaKey, {
      agentId,
      agentName,
      completedAt: new Date().toISOString(),
      outputLength: output.length,
    }, {
      writer: "dag-executor",
      timestamp: new Date().toISOString(),
      source_uri: `dag-executor:meta:${this.blackboard.sessionId}`,
    });
  }

  /** 读取上游 Agent 的产出（供下游 Agent 使用） */
  readUpstreamOutput(agentId: string, agentName: string): string {
    const key = `upstream$${agentId}$output`;
    const entry = this.blackboard.read(key);

    if (!entry) {
      // 向后兼容：如果 Blackboard 中没有，尝试从 Map 读取（仅过渡期）
      // return `（上游 ${agentName} 尚未完成或无输出）`;
      return `（上游 ${agentName} 尚未完成或无输出）`;
    }

    return entry.value as string;
  }
}

// 在 executeSupervisorDag() 中初始化
// const upstreamMgr = new UpstreamResults(blackboard);

// 修改 buildAgentPrompt()
function buildAgentPrompt(upstreamMgr: UpstreamResults, agentId: string, globalGoal: string): string {
  let prompt = globalGoal;

  const dependencies = topology.edges
    .filter((e) => e.to === agentId && e.type === "trigger")
    .map((e) => e.from);

  if (dependencies.length > 0) {
    const upstreamText = dependencies
      .map((depId) => {
        const depAgent = agents.find((a) => a.id === depId);
        const output = upstreamMgr.readUpstreamOutput(depId, depAgent?.name ?? depId);
        return `- 【${depAgent?.name ?? depId}】的产出：\n${output}`;
      })
      .join("\n\n");
    prompt += `\n\n【上游 Agent 产出】\n${upstreamText}\n\n请基于上述上游产出继续执行你的任务。`;
  }

  return prompt;
}

// Agent 完成时写入
// 在 processAgentCompletion(agentId, ...) 中
// upstreamMgr.writeUpstreamOutput(agentId, agentName, output);
```

---

### 补全 2：Blackboard 共享记忆的结构化读写 API

**问题：** 当前 Blackboard 只有底层的 `sharedData`/`read()`/`write()`，缺少语义化的共享内存操作

**解决方案：** 引入 `SharedMemoryHelper`，提供高层语义 API

```typescript
// 新增 SharedMemoryHelper
// src/modules/collaboration-runtime/session/shared-memory-helper.ts

export class SharedMemoryHelper {
  private blackboard: Blackboard;
  private sessionId: string;

  constructor(blackboard: Blackboard) {
    this.blackboard = blackboard;
    this.sessionId = blackboard.sessionId;
  }

  /**
   * 写入共享知识（供所有 Agent 读取）
   */
  writeSharedKnowledge(key: string, knowledge: {
    content: string;
    sourceAgent?: string;
    tags?: string[];
  }): void {
    const memoryKey = `shared$knowledge$${key}`;
    this.blackboard.write(memoryKey, knowledge.content, {
      writer: knowledge.sourceAgent ?? "system",
      timestamp: new Date().toISOString(),
      source_uri: `shared-memory:knowledge:${this.sessionId}`,
      tags: knowledge.tags ?? ["shared-knowledge"],
    });
  }

  /**
   * 读取共享知识
   */
  readSharedKnowledge(key: string): string | null {
    const memoryKey = `shared$knowledge$${key}`;
    const entry = this.blackboard.read(memoryKey);
    return entry ? entry.value as string : null;
  }

  /**
   * 写入 Agent 中间发现（临时共享，用于并行 Agent）
   */
  writeDiscovery(agentId: string, discovery: {
    type: string; // "fact", "observation", "warning"
    content: string;
  }): void {
    const key = `discovery$${agentId}${Date.now()}`;
    this.blackboard.write(key, discovery, {
      writer: agentId,
      timestamp: new Date().toISOString(),
      source_uri: `shared-memory:discovery:${this.sessionId}:${agentId}`,
      tags: ["discovery", discovery.type],
    });
  }

  /**
   * 查询所有最新发现（按时间排序）
   */
  listRecentDiscoveries(limit = 10): Array<{ key: string; discovery: unknown; time: string }> {
    const allEntries = this.blackboard.getEntries().filter((entry) =>
      entry.key.startsWith("discovery$")
    );

    return allEntries
      .sort((a, b) => b.provenance.timestamp.localeCompare(a.provenance.timestamp))
      .slice(0, limit)
      .map((entry) => ({
        key: entry.key,
        discovery: entry.value,
        time: entry.provenance.timestamp,
      }));
  }

  /**
   * 写入共享工具调结果（避免重复调用）
   */
  writeToolResult(toolCall: {
    toolName: string;
    arguments: Record<string, unknown>;
    result: unknown;
  }): void {
    const hash = this.hashToolCall(toolCall.toolName, toolCall.arguments);
    const key = `shared$tool_result$${toolCall.toolName}$${hash}`;
    this.blackboard.write(key, {
      toolName: toolCall.toolName,
      arguments: toolCall.arguments,
      result: toolCall.result,
      cachedAt: new Date().toISOString(),
    }, {
      writer: "system",
      timestamp: new Date().toISOString(),
      source_uri: `shared-memory:tool-cache:${this.sessionId}`,
      tags: ["tool-cache", toolCall.toolName],
    });
  }

  /**
   * 读取共享工具调结果
   */
  readToolResult(toolName: string, arguments: Record<string, unknown>): unknown | null {
    const hash = this.hashToolCall(toolName, arguments);
    const key = `shared$tool_result$${toolName}$${hash}`;
    const entry = this.blackboard.read(key);
    if (!entry) return null;

    const data = entry.value as { result: unknown; cachedAt: string };
    // 简单 TTL：30 分钟
    const ageMs = Date.now() - new Date(data.cachedAt).getTime();
    if (ageMs > 30 * 60 * 1000) return null;

    return data.result;
  }

  private hashToolCall(toolName: string, args: Record<string, unknown>): string {
    return `${toolName}:${JSON.stringify(args)}`;
  }
}
```

---

### 补全 3：Project Context 写入 Blackboard

**问题：** 当前 ProjectContext 只用于 Agent 子进程内部加载，不会写入共享 Blackboard

**解决方案：** Agent 启动时将 ProjectContext 写入 Blackboard，方便其他 Agent 查看

```typescript
// 新增 ProjectContextWriter
// src/modules/collaboration-runtime/bridge/project-context-writer.ts

export class ProjectContextWriter {
  private blackboard: Blackboard;
  private projectId: string;

  constructor(blackboard: Blackboard, projectId: string) {
    this.blackboard = blackboard;
    this.projectId = projectId;
  }

  /**
   * 将 ProjectContext 写入 Blackboard（在 Agent 启动时调用）
   */
  writeProjectContext(agentId: string, context: {
    agentMd: string;
    toolMd: string | null;
    tasteMd: string | null;
    memoryMd: string | null;
    knowledgeMd: string | null;
    patternsMd: string | null;
    installedSkills: string[];
    allowedTools: string[];
  }): void {
    const agentKey = `project$context$${this.projectId}$${agentId}`;
    const summary = {
      agentId,
      projectId: this.projectId,
      capabilities: this.extractCapabilities(context),
      skills: context.installedSkills,
      allowedTools: context.allowedTools,
      hasTaste: !!context.tasteMd,
      memoryBlocks: context.memoryMd ? this.countMemoryBlocks(context.memoryMd) : 0,
      updatedAt: new Date().toISOString(),
    };

    // 写入摘要（便于快速查询）
    this.blackboard.write(`${agentKey}$summary`, summary, {
      writer: agentId,
      timestamp: new Date().toISOString(),
      source_uri: `project-context:${this.projectId}:${agentId}`,
    });

    // 写入完整的 Tool.md（用于工具白名单检查）
    if (context.toolMd) {
      this.blackboard.write(`${agentKey}$tool`, context.toolMd, {
        writer: agentId,
        timestamp: new Date().toISOString(),
        source_uri: `project-context:${this.projectId}:${agentId}`,
      });
    }

    // 写入完整的 Memory.md（用于记忆共享）
    if (context.memoryMd) {
      this.blackboard.write(`${agentKey}$memory`, context.memoryMd, {
        writer: agentId,
        timestamp: new Date().toISOString(),
        source_uri: `project-context:${this.projectId}:${agentId}`,
      });
    }

    // 写入完整的 Knowledge.md（用于知识索引）
    if (context.knowledgeMd) {
      this.blackboard.write(`${agentKey}$knowledge`, context.knowledgeMd, {
        writer: agentId,
        timestamp: new Date().toISOString(),
        source_uri: `project-context:${this.projectId}:${agentId}`,
      });
    }
  }

  /**
   * 读取 Agent 的 Project Context 摘要
   */
  readProjectContextSummary(agentId: string): unknown | null {
    const agentKey = `project$context$${this.projectId}$${agentId}`;
    const entry = this.blackboard.read(`${agentKey}$summary`);
    return entry ? entry.value : null;
  }

  /**
   * 读取 Agent 的 Tool.md（用于构建工具列表）
   */
  readAgentToolMd(agentId: string): string | null {
    const agentKey = `project$context$${this.projectId}$${agentId}`;
    const entry = this.blackboard.read(`${agentKey}$tool`);
    return entry ? entry.value as string : null;
  }

  private extractCapabilities(context: {
    agentMd: string;
    ontologyOperations?: unknown;
  }): string[] {
    // 解析 Agent.md frontmatter 中的 capabilities
    const match = context.agentMd.match(/^---\n([\s\S]*?)\n---/);
    if (!match?.[1]) return [];

    const frontmatter = match[1];
    const capabilityMatch = frontmatter.match(/^capabilities:\s*\[([^\]]*)\]/m);
    if (!capabilityMatch?.[1]) return [];

    return capabilityMatch[1]
      .split(',')
      .map(s => s.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  }

  private countMemoryBlocks(memoryMd: string): number {
    // 简单统计：按 `## ` 计算块数量
    return (memoryMd.match(/^## /gm) ?? []).length;
  }
}
```

---

### 补全 4：Blackboard 键值命名约定扩展

**新增项目上下文相关的前缀：**

```typescript
// 扩展 memory-keys.ts
export enum SharedMemoryPrefix {
  UPSTREAM = "upstream",           // 上游 Agent 产出
  METADATA = "meta",               // 元数据
  SHARED_KNOWLEDGE = "shared$knowledge",  // 共享知识
  DISCOVERY = "discovery",         // Agent 发现
  TOOL_CACHE = "shared$tool_result", // 工具调用缓存
  PROJECT_CONTEXT = "project$context", // 项目上下文
}

export function buildUpstreamOutputKey(agentId: string): string {
  return `${SharedMemoryPrefix.UPSTREAM}$${agentId}$output`;
}

export function buildUpstreamMetaKey(agentId: string): string {
  return `${SharedMemoryPrefix.METADATA}$upstream$${agentId}`;
}

export function buildSharedKnowledgeKey(key: string): string {
  return `${SharedMemoryPrefix.SHARED_KNOWLEDGE}$${key}`;
}

export function buildProjectContextKey(projectId: string, agentId: string, suffix?: string): string {
  if (suffix) {
    return `${SharedMemoryPrefix.PROJECT_CONTEXT}$${projectId}$${agentId}$${suffix}`;
  }
  return `${SharedMemoryPrefix.PROJECT_CONTEXT}$${projectId}$${agentId}`;
}
```

---

## 📝 完整的修正方案更新

### 修正 1 增补：使用 Blackboard 存储上游产出

**新增文件：** `src/modules/collaboration-runtime/session/upstream-results.ts`

**修改文件：** `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`

### 修正 0（新增）：共享 Blackboard 记忆 API

**新增文件：** `src/modules/collaboration-runtime/session/shared-memory-helper.ts`

### 修正 9（新增）：Project Context 写入 Blackboard

**新增文件：** `src/lib/collaboration-runtime-bridge/project-context-writer.ts`

---

## ✅ 验收标准（补充）

- [ ] **UpstreamResults via Blackboard**：上游 Agent 完成后写入 `upstream$agentId$output`
- [ ] **Provenance 追踪**：上游产出记录 `writer`, `timestamp`, `source_uri`
- [ ] **共享知识 API**：`writeSharedKnowledge()` / `readSharedKnowledge()` 可复用知识
- [ ] **发现共享 API**：并行 Agent 可通过 `writeDiscovery()` 共享临时发现
- [ ] **工具缓存 API**：`writeToolResult()` / `readToolResult()` 避免重复调用
- [ ] **Project Context 持久化**：Agent 启动时写入 `project$context$projectId$agentId`
- [ ] **事件溯源完整**：所有共享数据都通过 Event Sourcing 重建
- [ ] **可观测性增强**：可通过 Blackboard 查询所有上游产出、共享知识、Agent 发现

---

## 🔄 技术文件更新（补充）

```
src/modules/collaboration-runtime/
└── session/
    ├── upstream-results.ts                    # NEW: 上游产出管理（替代 Map）
    └── shared-memory-helper.ts                 # NEW: 共享记忆 API

src/lib/collaboration-runtime-bridge/
└── project-context-writer.ts                 # NEW: Project Context 写入器
    │
└── multi-agent-executor.ts                 # MODIFY: 使用 Blackboard 替代 Map
```

---

**变更记录：**

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-05-22 | 补充说明：明确项目上下文写入、Blackboard 共享记忆现状，提出 4 个补全方案 | AI |
