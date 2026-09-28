# 架构设计 - Story 9.3

**Story:** 共享黑板（Blackboard）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- TypeScript 严格模式
- Event Sourcing 模式
- 文件系统 JSONL + JSON 快照

## 数据结构

### Blackboard 核心数据

- **SharedData**：键值存储（`get/set/delete`）
- **Messages**：ACL 消息队列（按 agentId 分组）
- **Tasks**：任务队列（状态机：pending → assigned → running → completed/failed）
- **Artifacts**：Agent 产出工件
- **Locks**：键级锁（agentId + TTL）

### 持久化

- 事件流：`events.jsonl`（Event Sourcing 源）
- 快照：`blackboard.json`（定期持久化）

## 模块设计

**文件：** `src/modules/collaboration-runtime/session/blackboard.ts`

## 代码变更

### 核心方法

```typescript
class Blackboard {
  // 从事件流重建
  fromEvents(events: RuntimeEvent[]): Blackboard

  // 数据读写
  getData(key: string): unknown
  setData(key: string, value: unknown, agentId: string): void

  // 锁
  lock(key: string, agentId: string, ttlMs: number): boolean
  release(key: string, agentId: string): void

  // 消息
  sendMessage(msg: ACLMessage): void
  getMessages(agentId: string): ACLMessage[]

  // 任务
  createTask(desc: string, dependsOn?: string[]): Task
  assignTask(taskId: string, agentId: string): void
  completeTask(taskId: string, output: unknown): void

  // 持久化
  snapshot(): Promise<void>
}
```
