# 架构设计 - Story 9.33

**Story:** Supervisor HITL 决策器
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 架构设计

### 核心设计思路

Supervisor 收到 WORKER_BLOCK 后显式选择四种决策：
1. **自助补参**：通过 bb_get_artifact 获取信息，dispatch_worker 补参重派
2. **改派**：判断信息归属其他 Worker，重新派发
3. **升级用户**：escalate_to_human，整合上下文后询问用户
4. **拒绝**：无法处理，标记 failed

### 架构层次

```
┌─────────────────────────────────────────────────┐
│  Supervisor Agent                                │
│  - 状态机：monitoring → block_received → deciding │
│  - 决策思考：判定 block.type → 尝试自助 → 判断归属 │
│  - 执行工具调用：dispatch_worker / escalate_to_human │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  决策日志模块                                     │
│  - decisions.jsonl：每次决策追加一行               │
│  - SUPERVISOR_DECIDE 事件：写入 events.jsonl      │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  防滥用约束模块                                   │
│  - 连续 ≥3 次升级同一 block.type → 拒绝           │
│  - 单 Block 决策延迟 > 60s → 告警 SUPERVISOR_STALL │
└─────────────────────────────────────────────────┘
```

---

## 技术栈

- **状态机**：Role.md（block_received / deciding 子状态）
- **工具 Schema**：zod（escalate_to_human mergedContext 验证）
- **决策日志**：JSONL 格式（decisions.jsonl）
- **防滥用计数**：Map<(workerId, block.type), count>

---

## 数据结构

### escalate_to_human 工具 Schema

```typescript
escalate_to_human({
  question: string;          // 整合后向用户的问题
  mergedContext: {
    onBehalfOf: string;       // 代哪个 Worker
    workerBlocks: WorkerBlock[];  // 触发本次升级的所有 Worker 阻塞
    knownInfo: Record<string, unknown>;  // Supervisor 已经知道的信息
    remainingFields: string[];  // 真正需要用户回答的字段
  };
})

// zod schema 验证
const EscalateToHumanSchema = z.object({
  question: z.string(),
  mergedContext: z.object({
    onBehalfOf: z.string().min(1),
    workerBlocks: z.array(WorkerBlockSchema).min(1),
    knownInfo: z.record(z.unknown()),
    remainingFields: z.array(z.string()).min(1)
  })
});
```

### 决策日志格式（decisions.jsonl）

```json
{
  "ts": "2026-07-20T10:30:00Z",
  "blockId": "block-123",
  "blockType": "need_input",
  "decision": "escalate",
  "rationale": "无法从 blackboard 获取命名规则，需要用户确认"
}
```

### 防滥用计数 Map

```typescript
const escalationCount = new Map<string, number>();
// key: `${workerId}:${block.type}`
// value: 连续升级次数

// 检查逻辑
const key = `${workerId}:${block.type}`;
const count = escalationCount.get(key) || 0;
if (count >= 3) {
  return { error: 'max_escalations_reached, must change strategy' };
}
```

### SUPERVISOR_DECIDE 事件

```typescript
interface SupervisorDecideEvent {
  type: 'SUPERVISOR_DECIDE';
  blockId: string;
  decision: 'self_serve' | 'reassign' | 'escalate' | 'reject';
  rationale: string;
  timestamp: string;
}
```

---

## 模块设计

### 1. Supervisor 决策状态机模块

**位置**：`data/agents/supervisor/Role.md`

**职责**：
- 新增 block_received / deciding 子状态
- 从 monitoring 进入，决策完成后回到 monitoring

**关键变更**：
- 添加决策状态机定义

### 2. Supervisor System Prompt 模块

**位置**：`data/agents/supervisor/Agent.md`

**职责**：
- Layer 3 新增决策思考步骤
- 引导 Supervisor 按步骤决策

**关键变更**：
- 添加决策思考流程

### 3. escalate_to_human 工具模块

**位置**：`src/modules/collaboration-runtime/sandbox/agent-worker.mts`

**职责**：
- 升级工具 schema
- zod 验证 mergedContext 字段

**关键变更**：
- 添加工具 schema 验证

### 4. 决策日志模块

**位置**：`src/modules/collaboration-runtime/engine/supervisor-decision-logger.ts`

**职责**：
- 每次决策追加 decisions.jsonl
- 发出 SUPERVISOR_DECIDE 事件

**关键变更**：
- 新增决策日志模块

### 5. 防滥用约束模块

**位置**：`src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`

**职责**：
- 连续 ≥3 次升级同一 block.type → 拒绝
- 单 Block 决策延迟 > 60s → 告警

**关键变更**：
- 添加防滥用计数逻辑
- 添加决策延迟告警

---

## 关键设计决策

### 决策 1：四路径决策器

**选项**：
- 自助补参 / 改派 / 升级用户 / 拒绝

**决策理由**：
- 覆盖常见场景
- 减少不必要的用户打扰

### 决策 2：mergedContext 强制字段

**规则**：
- escalate_to_human 必须含 mergedContext
- onBehalfOf 非空 + workerBlocks 长度 ≥ 1 + remainingFields 长度 ≥ 1

**决策理由**：
- 整合上下文，避免 Worker 原句直接发给用户
- 用户视图显式标注"代 {onBehalfOf} 询问"

### 决策 3：防滥用约束

**规则**：
- 同一 (workerId, block.type) 连续 ≥3 次升级 → 拒绝
- 强制 Supervisor 切换决策

**决策理由**：
- 防止 Supervisor 反复升级用户
- 促进自助解决

### 决策 4：补参重派语义

**规则**：
- dispatch_worker 支持"补参重派"
- 相同 workerId + 已存在 dispatchId → 发送 follow-up prompt 到原 Worker 子进程

**决策理由**：
- 避免重复 spawn 子进程
- 保留消息历史

---

## 代码变更

| 操作 | 文件路径 |
|------|---------|
| MODIFY | `data/agents/supervisor/Role.md` / `Agent.md`（决策状态机 + prompt 引导） |
| MODIFY | `src/modules/collaboration-runtime/sandbox/agent-worker.mts`（escalate_to_human schema） |
| MODIFY | `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`（决策日志、防滥用计数） |
| NEW | `src/modules/collaboration-runtime/engine/supervisor-decision-logger.ts` |
