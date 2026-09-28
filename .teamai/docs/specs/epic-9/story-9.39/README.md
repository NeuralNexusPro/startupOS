# Story 9.39: AgentBridge 清理与 pi-agent 依赖解耦

**Epic:** 9 — Multi-Agent 协作运行时
**状态:** 📋 Planning
**优先级:** Medium
**估计工时:** 1–2 天
**依赖:** 9.38（facade 层稳定后再动 bridge 剩余文件）
**源依据:** CLAUDE.md §模块依赖规约

---

## 用户故事

> 作为开发者，我希望 `src/lib/collaboration-runtime-bridge/` 目录能完全消失，不留任何残余，让协作相关代码统一归属 `modules/collaboration-runtime/`。

---

## 目标

评估并清理 `agent-bridge.ts`（死代码则删除，有效则迁移），评估 `event-mapper.ts`，迁移测试文件到 `engine/__tests__/`，清理 `agent-manager.ts` 中失效的 `CollaborationAgentBridge` 动态 import，最终删除整个 `collaboration-runtime-bridge/` 目录。

---

## 文档导航

| 文档 | 内容 |
|------|------|
| [需求文档](./requirements.md) | 用户故事、功能需求（bridge 评估/event-mapper 评估/测试迁移/agent-manager 清理/目录删除）、验收标准、依赖关系 |
| [架构设计](./architecture.md) | 背景、残留文件结构、模块设计 |
