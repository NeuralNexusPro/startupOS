# 需求文档 - Story 9.39

**Story:** AgentBridge 清理与 pi-agent 依赖解耦
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-05-22

---

## 用户故事

> 作为开发者，我希望 `src/lib/collaboration-runtime-bridge/` 目录能完全消失，不留任何残余，让协作相关代码统一归属 `modules/collaboration-runtime/`。

---

## 功能需求

### A. 确认 agent-bridge.ts 当前使用情况

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

### E. 删除目录

- [ ] `rm -rf src/lib/collaboration-runtime-bridge/`

---

## 验收标准

- [ ] `src/lib/collaboration-runtime-bridge/` 目录不存在
- [ ] `agent-manager.ts` TS 错误清零
- [ ] `npm run typecheck` 0 error（排除预存无关错误）
- [ ] `npm run lint` 0 error

---

## 依赖关系

- **前置依赖：** Story 9.38（facade 层稳定后再动 bridge 剩余文件）
- **源依据：** CLAUDE.md §模块依赖规约
