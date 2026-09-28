# 架构设计 - Story 9.31

**Story:** 单前台 Agent 契约（Supervisor as Sole Foreground Agent）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 架构设计

### 核心设计思路

从四个层面切断 Worker → User 直连通路：
1. **工具白名单**：Worker 模式不注册 `ask_user_question`
2. **事件路由**：Worker `HUMAN_REVIEW_REQUEST` 自动包装为 `WORKER_BLOCK` 并路由到 Supervisor
3. **UI 渲染**：前台对话窗口仅显示 `from === 'supervisor'` 的消息
4. **API 接口**：用户消息强制 `to: 'supervisor'`

### 架构层次

```
┌─────────────────────────────────────────────────┐
│  UI 协作会话视图                                 │
│  - 前台对话：仅渲染 from === 'supervisor'        │
│  - 内部活动：可折叠区域展示 Worker 活动          │
└─────────────────────────────────────────────────┘
                      ↑
┌─────────────────────────────────────────────────┐
│  POST /api/collaboration/sessions/[id]/messages │
│  - 消息体强制 to: 'supervisor'                   │
│  - schema 校验拒绝 to !== 'supervisor'           │
└─────────────────────────────────────────────────┘
                      ↑
┌─────────────────────────────────────────────────┐
│  multi-agent-executor.ts / event-mapper.ts      │
│  - Worker HUMAN_REVIEW_REQUEST → WORKER_BLOCK    │
│  - 路由到 Supervisor（不向 SSE 用户层发送）       │
└─────────────────────────────────────────────────┘
                      ↑
┌─────────────────────────────────────────────────┐
│  agent-worker.mts (Worker 模式)                 │
│  - 不注册 ask_user_question 工具                 │
│  - 工具白名单严格受限                            │
└─────────────────────────────────────────────────┘
```

---

## 技术栈

- **工具注册**：agent-worker.mts（Worker 模式分支）
- **事件映射**：event-mapper.ts（HUMAN_REVIEW_REQUEST → WORKER_BLOCK）
- **API 路由**：Next.js App Router（POST /api/collaboration/sessions/[id]/messages）
- **UI 渲染**：React 组件（协作会话视图）

---

## 数据结构

### WorkerBlock 类型（session/types.ts）

```typescript
export type WorkerBlock =
  | { 
      type: 'need_input'; 
      missingFields: string[]; 
      rationale: string; 
      suggestedQuestion?: string 
    }
  | { 
      type: 'decision_required'; 
      options: Array<{ id: string; label: string; impact?: string }>; 
      rationale: string 
    }
  | { 
      type: 'conflict_detected'; 
      conflictWith: string; 
      conflictField: string; 
      details: string 
    }
  | { 
      type: 'capability_missing'; 
      missing: string; 
      suggestedAgent?: string 
    };
```

### 事件路由规则

```typescript
// Worker 抛 HUMAN_REVIEW_REQUEST
if (event.type === 'HUMAN_REVIEW_REQUEST' && event.from === 'worker') {
  // 自动包装为 WORKER_BLOCK
  const workerBlock: WorkerBlock = {
    type: 'need_input',
    missingFields: [],
    rationale: event.payload.text,
    suggestedQuestion: event.payload.text
  };
  
  // 路由到 Supervisor（不向 SSE 用户层发送）
  routeToSupervisor(workerBlock);
}
```

### API 消息 Schema

```typescript
interface UserMessage {
  to: 'supervisor';  // 强制字段
  content: string;
  timestamp: string;
}

// schema 校验
if (message.to !== 'supervisor') {
  throw new Error('User messages must be directed to supervisor');
}
```

---

## 模块设计

### 1. Worker 工具注册模块

**位置**：`src/modules/collaboration-runtime/sandbox/agent-worker.mts`

**职责**：
- Worker 模式启动时不注册 `ask_user_question` 工具
- 工具白名单严格受限

**关键变更**：
- 移除 `ask_user_question` 注册逻辑
- 添加工具白名单校验

### 2. 工具 Scope 过滤模块

**位置**：`src/lib/integrations/pi-agent/agent-manager.ts`

**职责**：
- 按 scope 过滤工具
- `scope: 'worker'` 时强制剔除 `ask_user_question`

**关键变更**：
- 添加工具过滤逻辑

### 3. 事件路由模块

**位置**：`src/lib/collaboration-runtime-bridge/event-mapper.ts`

**职责**：
- 检测 Worker `HUMAN_REVIEW_REQUEST` 事件
- 自动包装为 `WORKER_BLOCK{type:'need_input'}`
- 路由到 Supervisor

**关键变更**：
- 添加事件包装逻辑
- 阻止事件向 SSE 用户层发送

### 4. API 路由模块

**位置**：`src/app/api/collaboration/sessions/[id]/messages/route.ts`

**职责**：
- 接收用户消息
- 强制 `to: 'supervisor'`
- schema 校验拒绝 `to !== 'supervisor'`

**关键变更**：
- 移除 `to: workerId` 代码分支
- 添加 schema 校验

### 5. UI 协作视图模块

**位置**：UI 协作查看器组件

**职责**：
- 前台对话窗口仅渲染 `from === 'supervisor'` 的消息
- Worker 内部活动以可折叠区域呈现
- 旧数据兼容

**关键变更**：
- 添加消息过滤逻辑
- 实现两层渲染（前台/内部活动）

---

## 关键设计决策

### 决策 1：Worker 工具白名单严格受限

**规则**：
- Worker 模式不注册 `ask_user_question`
- Worker 无法直接面向用户

**决策理由**：
- 产品层"单前台 Agent"原则
- 所有用户可见消息必须经由 Supervisor

### 决策 2：HUMAN_REVIEW_REQUEST 自动包装

**规则**：
- Worker `HUMAN_REVIEW_REQUEST` → `WORKER_BLOCK{type:'need_input'}`
- 路由到 Supervisor（不向 SSE 用户层发送）

**决策理由**：
- 保持向后兼容
- 统一阻塞处理流程

### 决策 3：UI 两层渲染

**规则**：
- 前台对话：仅显示 Supervisor 消息
- 内部活动：可折叠区域展示 Worker 活动

**决策理由**：
- 用户体验清晰
- 避免 Worker 活动干扰主对话

### 决策 4：API 强制 to: 'supervisor'

**规则**：
- 用户消息强制 `to: 'supervisor'`
- schema 校验拒绝 `to !== 'supervisor'`

**决策理由**：
- 工程层面强约束
- 防止用户误操作

---

## 代码变更

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| MODIFY | `src/modules/collaboration-runtime/sandbox/agent-worker.mts` | Worker 模式工具注册移除 `ask_user_question` |
| MODIFY | `src/lib/integrations/pi-agent/agent-manager.ts` | scope 过滤强制剔除 |
| MODIFY | `src/lib/collaboration-runtime-bridge/event-mapper.ts` | `HUMAN_REVIEW_REQUEST` → `WORKER_BLOCK` 包装 |
| MODIFY | `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` | 事件路由强制经过 Supervisor |
| MODIFY | `src/app/api/collaboration/sessions/[id]/messages/route.ts` | `to: supervisor` 强约束 |
| MODIFY | UI 协作看器组件 | 前台/内部活动两层渲染 |
