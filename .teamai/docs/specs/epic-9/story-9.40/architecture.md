# 架构设计 - Story 9.40

**Story:** 协作 UI 体验优化 — 多 HITL 并发 + 消息流对齐
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 背景与现有问题

### 问题 1：多 Worker 并发 HITL 时 UI 混乱

当前 `isAwaitingHitl` 是一个 boolean，只记录"最后一个" HITL 请求。如果两个 Worker 先后发出 HITL_ESCALATE，第一个会被第二个覆盖，用户回复的 resume channel 指向最后注册的 worker，第一个 worker 永久挂起。

### 问题 2：Coordination 事件噪音

`dispatch_worker`、`wait_workers`、`AGENT_THINKING` 等协调事件在消息流中逐条显示，用户无法聚焦在真正重要的信息上。对于完成 10 个 Worker 的任务，用户会看到 20+ 条协调消息穿插在对话中。

### 问题 3：消息流缺少分组/折叠

目前所有消息平铺，没有"任务组"概念，无法区分"针对目标 A 的协作过程"和"针对目标 B 的新一轮协作"。

---

## 数据结构

### A.2 多 HITL 并发数据结构

```typescript
interface HitlRequest {
  eventId: string;
  workerId: string;
  workerName: string;
  question: string;
  timestamp: string;
}
```

### A.3 派生逻辑

```typescript
const pendingHitlRequests = useMemo(() => {
  const requests: HitlRequest[] = [];
  for (const ev of events) {
    if (ev.type === "HUMAN_REVIEW_REQUEST") {
      const workerId = String(ev.payload?.agentId ?? "");
      const alreadyReplied = events.some(
        (e) => (e.type === "USER_REPLY_TO_SUPERVISOR" || e.type === "HUMAN_REVIEW_RESPONSE")
          && e.timestamp > ev.timestamp
          && String(e.payload?.workerId ?? "") === workerId
      );
      if (!alreadyReplied) {
        requests.push({ eventId: ev.id, workerId, workerName: resolveAgentName(workerId), question: ..., timestamp: ev.timestamp });
      }
    }
  }
  return requests;
}, [events]);
```

### B.2 Coordination 折叠数据结构

```typescript
interface CoordinationGroup {
  id: string;
  role: "coordination-group";
  items: ForegroundMessage[];
  timestamp: string;
  expanded?: boolean;
}
type DisplayMessage = ForegroundMessage | CoordinationGroup;
```

---

## 模块设计

### A.1 后端：hitlChannelByWorker 支持多个并发

当前 `resumeSupervisorHitl` 取最后注册的 channel。改为：
- 维护有序队列：`Map<workerId, channel>` 支持多个 worker 同时挂起
- `resumeSupervisorHitl` 接受可选 `workerId` 参数，精确路由
- 前端回复时携带 `workerId`（从 `HUMAN_REVIEW_REQUEST.payload.agentId` 取）

API 修改：
- `POST /api/collaboration/sessions/[id]/messages` body 增加可选 `workerId` 字段
- `sendMessageToSupervisor(id, message, workerId?)` 签名扩展

### B. Coordination 事件折叠

#### B.1 折叠规则

将连续的 coordination 事件（`isCoordination: true`）合并为一个可展开的"协调摘要"组件：
- 合并条件：相邻 coordination 事件之间没有用户消息或 supervisor 文本消息
- 展示：`"Supervisor 协调了 N 个步骤"` + 展开箭头
- 展开后显示完整 pill 列表

#### B.2 实现位置

在 `formatForegroundMessages` 后增加 `collapseCoordinationGroups()` 后处理函数。

#### B.3 展开状态

用 `useState<Set<string>>` 记录展开的 group id，不持久化。

### C. 任务轮次分隔线

每次用户发送新目标（`USER_INPUT` 后 Supervisor 开始新 DAG）时，在消息流中插入分隔线：
```
────── 新任务：{goal 前 40 字} · {时间} ──────
```

实现：在 `formatForegroundMessages` 中检测 `USER_INPUT` 事件后紧跟 `SUPERVISOR_AGENT_START`，插入 `type: "DIVIDER"` 消息。

### D. 消息时间戳优化

- 相邻消息时间差 < 60s 时，隐藏重复时间戳
- 只在时间差 > 60s 或消息角色切换时显示时间戳
- 时间格式：今天显示 `HH:mm`，昨天显示 `昨天 HH:mm`，更早显示 `MM/DD HH:mm`
