# 需求规格 - Story 9.33

**Story:** Supervisor HITL 决策器
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为 Supervisor，当我收到 Worker 的 `WORKER_BLOCK` 事件时，我希望显式选择四种决策（自助补参 / 改派 / 升级用户 / 拒绝）中的一种，并把整合后的上下文（不是 Worker 原句）发给用户。

---

## 功能需求

### A. Supervisor 决策状态机扩展（必须）

- [ ] `Role.md` 状态机新增 `block_received` / `deciding` 子状态：从 `monitoring` 进入，决策完成后回到 `monitoring`
- [ ] system prompt Layer 3 新增决策思考步骤：
  ```
  收到 WORKER_BLOCK → 判定 block.type
  → 尝试自助：bb_get_artifact / 历史 messages 是否含信息
  → 自助失败 → 判断信息归属：是否其他 Worker 应当产出 → 改派 vs 升级用户
  → 决策日志 → 执行工具调用
  ```

### B. escalate_to_human 工具签名升级（必须）

- [ ] 工具 schema 强制 `mergedContext` 字段：

```typescript
escalate_to_human({
  question: string;          // 整合后向用户的问题
  mergedContext: {
    onBehalfOf: string;       // 代哪个 Worker
    workerBlocks: WorkerBlock[];  // 触发本次升级的所有 Worker 阻塞（可能合并多个）
    knownInfo: Record<string, unknown>;  // Supervisor 已经知道的信息
    remainingFields: string[];  // 真正需要用户回答的字段
  };
})
```

- [ ] schema 验证：`mergedContext.onBehalfOf` 非空 + `workerBlocks` 长度 ≥ 1 + `remainingFields` 长度 ≥ 1
- [ ] 用户视图渲染时显式标注"代 {onBehalfOf} 询问"

### C. 决策日志（必须）

- [ ] `sessionDir/supervisor/memory/decisions.jsonl` 每次决策追加一行：
  ```json
  {"ts":"...","blockId":"...","blockType":"need_input","decision":"escalate","rationale":"..."}
  ```
- [ ] 事件 `SUPERVISOR_DECIDE` 写入 `events.jsonl`，payload 含 decision + rationale

### D. 防滥用约束（必须）

- [ ] 同一 `(workerId, block.type)` 组合连续 ≥3 次升级用户 → 运行时拒绝下一次 `escalate_to_human`，强制 Supervisor 切换决策（在工具 result 中返回错误"max_escalations_reached, must change strategy"）
- [ ] 单 Block 决策延迟超过 60s 未输出工具调用 → 运行时记录告警，事件流标记 `SUPERVISOR_STALL`

### E. 自助决策路径（必须）

- [ ] `dispatch_worker` 工具支持"补参重派"语义：相同 `workerId` + 已存在 `dispatchId` 时，发送 follow-up prompt 到原 Worker 子进程（resume），而非 spawn 新进程
- [ ] follow-up prompt 模板：`【补充参数】\n{key}: {value}\n\n请基于以上补充信息继续完成原任务。`

---

## 验收标准

1. - [ ] 实证：`proj-1778321075425-gmv0zt4h8` 中 naming-reviewer 抛 `need_input{missingFields:['命名规则']}` → Supervisor 通过 `bb_get_artifact` 拿到 design-data-import 的产出 → 自助补参重派，无需升级用户
2. - [ ] 反例：3 次连续升级同一 block 类型 → 第 4 次被拒绝
3. - [ ] `escalate_to_human` 缺失 mergedContext → schema 校验失败
4. - [ ] decisions.jsonl 含完整决策轨迹
5. - [ ] 单测覆盖四种决策路径

---

## 边界条件

### 不在范围

- ❌ 用户回复路由：见 9.34
- ❌ Workflow 模式 Lightweight Supervisor：见 9.35

---

## 依赖关系

- **依赖**: 9.32（report_block 契约）
- **被依赖**: 9.34（用户回复路由收敛到 Supervisor）依赖本 Story

---

## 范围

### 关键文件

| 操作 | 文件路径 |
|------|---------|
| MODIFY | `data/agents/supervisor/Role.md` / `Agent.md`（决策状态机 + prompt 引导） |
| MODIFY | `src/modules/collaboration-runtime/sandbox/agent-worker.mts`（escalate_to_human schema） |
| MODIFY | `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`（决策日志、防滥用计数） |
| NEW | `src/modules/collaboration-runtime/engine/supervisor-decision-logger.ts` |
