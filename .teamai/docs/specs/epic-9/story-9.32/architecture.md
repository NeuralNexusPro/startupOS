# 架构设计 - Story 9.32

**Story:** Worker 结构化阻塞契约（report_block）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 架构设计

### 核心设计思路

将 Worker 阻塞从自然语言提问升级为结构化契约：
- Worker 通过 `report_block` 工具上报阻塞
- 阻塞类型机器可读（need_input / decision_required / conflict_detected / capability_missing）
- Supervisor 可基于结构化数据做出决策

### 架构层次

```
┌─────────────────────────────────────────────────┐
│  Supervisor（9.33 实现）                         │
│  - 接收 WORKER_BLOCK 事件                        │
│  - 基于 block.type 做出决策                      │
└─────────────────────────────────────────────────┘
                      ↑
┌─────────────────────────────────────────────────┐
│  运行时事件路由                                   │
│  - report_block 调用 → WORKER_BLOCK 事件         │
│  - 路由到 Supervisor                             │
│  - Worker dispatchId 加入 blockedDispatches map  │
└─────────────────────────────────────────────────┘
                      ↑
┌─────────────────────────────────────────────────┐
│  agent-worker.mts (Worker 模式)                 │
│  - 注入 report_block(block: WorkerBlock) 工具    │
│  - zod schema 验证 block 字段                    │
│  - 调用后进入 BLOCKED 状态（挂起但不销毁）        │
└─────────────────────────────────────────────────┘
```

---

## 技术栈

- **工具注入**：agent-worker.mts（Worker 模式）
- **Schema 验证**：zod（block 字段验证）
- **事件路由**：event-mapper.ts（WORKER_BLOCK 事件）
- **状态管理**：blockedDispatches map（挂起的 Worker）

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

export interface WorkerBlockEvent {
  type: 'WORKER_BLOCK';
  workerId: string;
  dispatchId: string;
  block: WorkerBlock;
  timestamp: string;
}
```

### report_block 工具 Schema

```typescript
// zod schema
const WorkerBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('need_input'),
    missingFields: z.array(z.string()),
    rationale: z.string(),
    suggestedQuestion: z.string().optional()
  }),
  z.object({
    type: z.literal('decision_required'),
    options: z.array(z.object({
      id: z.string(),
      label: z.string(),
      impact: z.string().optional()
    })),
    rationale: z.string()
  }),
  z.object({
    type: z.literal('conflict_detected'),
    conflictWith: z.string(),
    conflictField: z.string(),
    details: z.string()
  }),
  z.object({
    type: z.literal('capability_missing'),
    missing: z.string(),
    suggestedAgent: z.string().optional()
  })
]);
```

### blockedDispatches Map

```typescript
// 运行时状态
const blockedDispatches = new Map<string, {
  workerId: string;
  dispatchId: string;
  block: WorkerBlock;
  timestamp: string;
}>();
```

---

## 模块设计

### 1. WorkerBlock 类型定义模块

**位置**：`src/modules/collaboration-runtime/session/types.ts`

**职责**：
- 定义 WorkerBlock 联合类型（4 种阻塞类型）
- 定义 WorkerBlockEvent 接口

**关键变更**：
- 新增 WorkerBlock 类型
- 新增 WorkerBlockEvent 接口

### 2. report_block 工具模块

**位置**：`src/modules/collaboration-runtime/sandbox/agent-worker.mts`

**职责**：
- Worker 模式注入 `report_block(block: WorkerBlock)` 工具
- zod schema 验证 block 字段
- 调用后 Worker 进程进入 BLOCKED 状态

**关键变更**：
- 新增 report_block 工具注册
- 添加 zod schema 验证
- 实现 BLOCKED 状态挂起逻辑

### 3. 事件路由模块

**位置**：`src/lib/collaboration-runtime-bridge/event-mapper.ts`

**职责**：
- report_block 调用 → WORKER_BLOCK 事件
- 事件 append 到 events.jsonl
- 路由到 Supervisor

**关键变更**：
- 添加 WORKER_BLOCK 事件处理
- 实现事件路由逻辑

### 4. Worker Agent 模板

**位置**：`data/agents/{worker-template}/Agent.md`

**职责**：
- 使用说明：阻塞场景示例 + 反例
- 引导 Worker 使用 report_block 而非自然语言提问

**关键变更**：
- 添加 report_block 使用说明
- 提供阻塞场景示例

---

## 关键设计决策

### 决策 1：结构化阻塞 vs 自然语言提问

**选项**：
- (a) 结构化 report_block 工具（本 Story 采用）
- (b) 保留自然语言 HUMAN_REVIEW_REQUEST

**决策理由**：
- 结构化数据便于 Supervisor 决策
- 机器可读，减少 LLM 推理成本
- 支持 4 种阻塞类型，覆盖常见场景

### 决策 2：Worker BLOCKED 状态

**规则**：
- 调用 report_block 后 Worker 进入 BLOCKED 状态
- 挂起但不销毁（保留消息历史）
- 待 Supervisor dispatch_worker 触发 resume

**决策理由**：
- 保留消息历史用于 resume
- 避免重复 spawn 子进程

### 决策 3：zod Schema 验证

**规则**：
- block 字段用 zod 验证
- schema 校验失败返回错误，让 LLM 重试

**决策理由**：
- 确保数据结构正确
- LLM 可基于错误提示重试

### 决策 4：向后兼容

**规则**：
- 9.31 中 HUMAN_REVIEW_REQUEST → WORKER_BLOCK{need_input} 包装路径保留
- 历史事件 UI 渲染为 deprecated 样式

**决策理由**：
- 保持向后兼容
- 旧数据可正常渲染

---

## 代码变更

| 操作 | 文件路径 |
|------|---------|
| MODIFY | `src/modules/collaboration-runtime/session/types.ts` |
| MODIFY | `src/modules/collaboration-runtime/sandbox/agent-worker.mts` |
| MODIFY | `src/lib/collaboration-runtime-bridge/event-mapper.ts` |
| MODIFY | `data/agents/{worker-template}/Agent.md`（模板示例） |
