# 架构设计 - Story 9.39

**Story:** AgentBridge 清理与 pi-agent 依赖解耦
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 背景

9.38 完成后，`src/lib/collaboration-runtime-bridge/` 仍残留：

```
src/lib/collaboration-runtime-bridge/
  ├── agent-bridge.ts          ← 被 pi-agent/agent-manager.ts 引用
  ├── event-mapper.ts          ← agent-bridge.ts 内部依赖
  └── __tests__/
      ├── event-mapper.test.ts
      ├── multi-agent-executor.test.ts  ← 9.38 迁移后变空/删除
      ├── story-9-33-34.test.ts
      ├── story-9-35.test.ts
      └── worker-block.test.ts
```

`agent-bridge.ts` 的核心问题：`CollaborationAgentBridge` 被 `agent-manager.ts` 动态 import，但 `agent-manager.ts` 目前有 TS 错误（`Property 'CollaborationAgentBridge' does not exist`），说明该引用已失效，可以直接删除。

---

## 模块设计

### A. agent-bridge.ts 评估

- [ ] `grep -rn "CollaborationAgentBridge\|agent-bridge" src/` 确认调用点
- [ ] 检查 `agent-bridge.ts` 导出的函数是否还被其他地方有效使用
- [ ] 如果是死代码 → 直接删除
- [ ] 如果仍有有效使用 → 迁移到 `modules/collaboration-runtime/integrations/`

### B. event-mapper.ts 评估

- [ ] 检查 `event-mapper.ts` 是否有独立价值（Runtime event 类型映射）
- [ ] 如果逻辑有价值 → 迁移到 `modules/collaboration-runtime/session/event-mapper.ts`
- [ ] 如果已被 agent-worker.mts 内联替代 → 删除

### C. 测试迁移

- [ ] 将 `__tests__/event-mapper.test.ts` 随 event-mapper 一起迁移或删除
- [ ] `__tests__/story-9-33-34.test.ts` → `engine/__tests__/`
- [ ] `__tests__/story-9-35.test.ts` → `engine/__tests__/`
- [ ] `__tests__/worker-block.test.ts` → `engine/__tests__/`

### D. 清理 pi-agent/agent-manager.ts

- [ ] 删除已失效的 `CollaborationAgentBridge` 动态 import 及相关逻辑
- [ ] 确保 `agent-manager.ts` 的 TS 错误归零
