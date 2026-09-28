# 架构 - Story 9.37

**Story:** HITL 直连与协作链路扁平化
**Epic:** Epic 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## HITL 直连数据流

```
Worker (ask_user_question)
  │
  │  emit HITL_ESCALATE { workerId, question, options, onBehalfOfName }
  ▼
Bridge.captureWorkerEvent
  │
  │  hitlChannelByWorker.set(workerId, { resume: workerProc.resume, ... })
  │  hitlResumerRegistry.set(sessionId, (reply) => workerProc.resume(reply))
  │  emit HUMAN_REVIEW_REQUEST { onBehalfOf: workerId, question, ... }
  ▼
Facade.eventBus → SSE → 前端
                                 ┌─ 用户输入 ─┐
                                 ▼            │
                         POST /messages       │
                                 │            │
                                 ▼            │
              Facade.sendMessageToSupervisor  │
                                 │            │
                emit USER_REPLY_TO_SUPERVISOR │
                                 │            │
                                 ▼            │
                resumeSupervisorHitl(sid, reply)
                                 │
                  ┌──────────────┴──────────────┐
                  │                             │
        命中 hitlChannelByWorker        未命中, fallback
                  │                             │
                  ▼                             ▼
          workerProc.resume(reply)    supervisor.escalate_to_human resolver
                  │
                  ▼
          Worker 子进程 stdin
                  │
                  ▼
          waitForHumanResponse 解除挂起
```

---

## Supervisor 视角变化

| 场景 | 9.36 行为 | 9.37 行为 |
|---|---|---|
| Worker 阻塞 | wait_workers 提前返回，含 worker_hitl_request | wait_workers 持续等待，直到 worker 完成 |
| Worker resume 后 | Supervisor 调 resume_worker | bridge 直接 resume，Supervisor 无感知 |
| Supervisor 自己问用户 | escalate_to_human | 保留 escalate_to_human |

---

## 状态/会话兼容性

- 已有 session 的 `hitl-trace` 不存在 → 容错：用空数组初始化
- `hitlResumerRegistry`（HMR 安全的 globalThis 注册表）保留，本 Story 内仅扩展为按 worker 路由
