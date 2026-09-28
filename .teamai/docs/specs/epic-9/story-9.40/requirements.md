# 需求文档 - Story 9.40

**Story:** 协作 UI 体验优化 — 多 HITL 并发 + 消息流对齐
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 用户故事

> 作为用户，当多个 Worker 同时等待我输入时，我希望看到每个 Worker 的问题卡片是分开展示的，我可以逐一回复；同时我希望协作窗体的消息流更接近普通 IM 的体验——不被密集的 coordination 事件淹没。

---

## 功能需求

### A. 多 HITL 并发支持（核心）

#### A.1 后端：hitlChannelByWorker 支持多个并发

当前 `resumeSupervisorHitl` 取最后注册的 channel。改为：
- 维护有序队列：`Map<workerId, channel>` 支持多个 worker 同时挂起
- `resumeSupervisorHitl` 接受可选 `workerId` 参数，精确路由
- 前端回复时携带 `workerId`（从 `HUMAN_REVIEW_REQUEST.payload.agentId` 取）

API 修改：
- `POST /api/collaboration/sessions/[id]/messages` body 增加可选 `workerId` 字段
- `sendMessageToSupervisor(id, message, workerId?)` 签名扩展

#### A.2 前端：多 HITL 卡片并发展示

`isAwaitingHitl` 改为 `pendingHitlRequests: HitlRequest[]`（数组）：
```typescript
interface HitlRequest {
  eventId: string;
  workerId: string;
  workerName: string;
  question: string;
  timestamp: string;
}
```

UI 展示：
- 每个 `pendingHitlRequests` 项渲染一个独立的 HITL 卡片（黄色气泡）
- 卡片展示"代 {workerName} 询问"+ 问题文本
- 每个卡片底部有独立输入框 + 发送按钮
- 回复后该卡片消失（携带 `workerId` 发送，bridge 精确 resume）

#### A.3 派生逻辑

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

---

### B. Coordination 事件折叠（UX 优化）

#### B.1 折叠规则

将连续的 coordination 事件（`isCoordination: true`）合并为一个可展开的"协调摘要"组件：
- 合并条件：相邻 coordination 事件之间没有用户消息或 supervisor 文本消息
- 展示：`"Supervisor 协调了 N 个步骤"` + 展开箭头
- 展开后显示完整 pill 列表

#### B.2 实现位置

在 `formatForegroundMessages` 后增加 `collapseCoordinationGroups()` 后处理函数：
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

#### B.3 展开状态

用 `useState<Set<string>>` 记录展开的 group id，不持久化。

---

### C. 任务轮次分隔线（UX 优化）

每次用户发送新目标（`USER_INPUT` 后 Supervisor 开始新 DAG）时，在消息流中插入分隔线：
```
────── 新任务：{goal 前 40 字} · {时间} ──────
```

实现：在 `formatForegroundMessages` 中检测 `USER_INPUT` 事件后紧跟 `SUPERVISOR_AGENT_START`，插入 `type: "DIVIDER"` 消息。

---

### D. 消息时间戳优化

- 相邻消息时间差 < 60s 时，隐藏重复时间戳
- 只在时间差 > 60s 或消息角色切换时显示时间戳
- 时间格式：今天显示 `HH:mm`，昨天显示 `昨天 HH:mm`，更早显示 `MM/DD HH:mm`

---

## 验收标准

### 多 HITL 并发

- [ ] 两个 Worker 同时发出 HITL_ESCALATE，UI 显示两个独立 HITL 卡片
- [ ] 分别回复两个卡片，两个 Worker 各自收到正确的 resume
- [ ] 一个 Worker resume 后其卡片消失，另一个卡片保持

### Coordination 折叠

- [ ] 连续 3 条以上 coordination 事件默认折叠为摘要
- [ ] 点击展开显示完整列表
- [ ] 折叠不影响 HITL、文本消息的正常渲染

### 任务分隔线

- [ ] 用户发送第二个目标时，消息流出现分隔线
- [ ] 分隔线显示目标前 40 字和时间

---

## 依赖关系

- **前置依赖：** Story 9.37（HITL 直连稳定后做 UI 层优化）

---

## 边界条件 / 后续扩展（不在本 Story）

- HITL 超时机制（用户 N 分钟未回复，Worker 自动 fail / use default value）
- HITL 历史回放（SSE 重连后并发 HITL 状态正确恢复）
