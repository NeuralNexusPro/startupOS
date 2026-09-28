# 架构 - Story 9.26

**Story:** 多 Agent 协作 Prompt 构建 — Data.md + Process.md 注入 + DAG Human-in-the-Loop
**Epic:** Epic 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 架构总览

详见 [docs/design/multi-agent-prompt-architecture.md](../../../design/multi-agent-prompt-architecture.md)

```
agent-worker.mts — initialize()
  │
  ├─ agentType === "originos" || "skill"
  │   ├─ 检测到 Data.md + Process.md → initializeProjectAgent()
  │   │   └─ loadProjectCollaborationContext() → buildCollaborationPrompt()
  │   │      → 创建 OriginOSAgent，注入 7 层 prompt + 工具 + Memory
  │   │
  │   └─ 否则 → initializeOriginOSAgent()
  │       └─ buildProjectPromptLayers() → 6 层 prompt（interview 类型）
  │
  └─ 否则 → initializePersistentAgent()
      └─ PersistentAgent 内置 prompt 建设
```

---

## DAG Human-in-the-Loop 交互流

```
DAG 执行 → Agent A 运行中（SSE 推送 DAG_PROGRESS 事件）
    ↓
Agent A 检测需要确认 → 发出 HUMAN_REVIEW_REQUEST 事件
    ↓
AgentExecutor 返回 waiting 状态
    ↓
DagExecutor 收到 → 节点: running → waiting → 发出 DAG_PROGRESS
    ↓ 阻塞下游触发（b、c 保持 pending）
    ↓
UI 拓扑图节点变"等待确认"状态
    ↓
用户点击节点 → CUI 面板弹出（显示请求内容 + 上下文）
    ↓
用户回复 → POST /api/collaboration/sessions/[id]/human-review
    ↓
Runtime 找到对应回调 → executor.resumeNode(agentId, userResponse)
    ↓
节点 completed → 触发下游
```

---

## 三种协作模式的 HITL 交互差异

| 维度 | DAG (Workflow) | Supervisor (层级) | Blackboard (System) |
|------|----------------|-------------------|---------------------|
| Human-in-Loop | Agent 请求确认时暂停，阻塞下游 | Supervisor 分配审查任务给用户 | 无暂停，Agent 自主请求 |
| 暂停影响 | 阻塞当前节点及其所有下游 | 只阻塞当前子任务 | 无阻塞 |
| 主入口 | DAG 拓扑图 + 节点实时状态 | Supervisor 任务树 | 黑板 + 事件时间线 |
| 推进机制 | 用户确认 → 恢复节点 → 自动触发下游 | Supervisor 重新分配或继续 | Agent 自主决定继续 |

**本次仅实现 DAG 模式，Supervisor/Blackboard 的 Human-in-the-Loop 在对应 Story 中实现。**

---

## 技术文件

```
src/lib/integrations/pi-agent/project-agent/project-collaboration-context.ts  # NEW — 上下文加载
src/lib/integrations/pi-agent/project-agent/collaboration-prompt.ts          # NEW — 7 层 prompt 构建
src/modules/collaboration-runtime/sandbox/agent-worker.mts                   # MODIFY — 新增 initializeProjectAgent() + 分发
src/modules/collaboration-runtime/session/types.ts                           # MODIFY — 新增 3 个事件类型
src/modules/collaboration-runtime/engine/dag-executor.ts                     # MODIFY — waiting 状态 + pause/resume
src/lib/collaboration-runtime-bridge/multi-agent-executor.ts                 # MODIFY — Human Review + prompt 注入
src/lib/collaboration-runtime-service/index.ts                               # MODIFY — respondToHumanReview
src/app/api/collaboration/sessions/[id]/human-review/route.ts                # NEW — 用户回复 API
docs/design/multi-agent-prompt-architecture.md                               # NEW — 架构设计文档
```

---

## 与现有代码的关系

- `project-context.ts` + `project-prompt.ts` **保持不变**，服务于 interview 类型 Agent
- 新建的 `project-collaboration-context.ts` + `collaboration-prompt.ts` 服务于多 Agent 协作场景
- `agent-worker.mts` 通过动态 import 按需加载，不影响现有代码路径
- `initializeOriginOSAgent()` 和 `initializePersistentAgent()` 行为完全不变
