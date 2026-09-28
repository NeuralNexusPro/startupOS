# Story 10.9: Next.js HTTP API → Electron IPC 服务化迁移

**Story 编号:** 10.9
**Epic:** 10 - OriginOS CE 客户端
**优先级:** 🔴 High
**状态:** 🚧 In Progress
**前置 Story:** 10.1（Electron 基础框架）/ 10.3（本地 FS 直连）/ 10.4（本地 Agent Runtime）/ 10.8（容器边界清理）
**创建日期:** 2026-06-12

---

## 📋 概述

CE（Electron Desktop）版本目前仍依赖本地启动的 Next.js dev server 提供后端能力，所有业务调用都走 `fetch('/api/...')` → `route.ts` 处理器。这一架构在 10.3（FS 直连）和 10.4（Agent Runtime）中已经在两个领域局部解耦，但剩余 ~106 个 `route.ts` 文件仍紧耦合 Next.js，导致离线场景失败、冷启动延迟、进程隔离不彻底、CE 分发体积膨胀、架构一致性缺口等问题。

---

## 🎯 核心目标

| 目标 | 说明 |
|------|------|
| **服务化重构** | 业务逻辑全部归属 `@originos/core`，`route.ts` 与 IPC handler 共享同一服务函数 |
| **IPC 通道扩展** | `IPC_CHANNELS` 按领域扩展（skill / project / ontology / collaboration / 等） |
| **统一适配器** | `packages/core/src/lib/integrations/electron/services/` 提供平台无关客户端，内部 `isElectron()` 分支 |
| **SSE → IPC Stream** | Collaboration / Agent 等流式接口改用 `BrowserWindow.webContents.send` 推送事件 |
| **零回归 / 双轨运行** | Web 版本继续使用 HTTP API；CE 版本走 IPC；同一调用点通过适配器无缝切换 |
| **CE 离线启动** | CE 无需启动 `next dev`/HTTP server 即可完整运行（Phase 3 目标） |

---

## ✅ 验收标准

### AC1：业务逻辑单一来源
- 每个领域的核心函数只存在于 `@originos/core/lib/features/<domain>/`
- `route.ts` 与 IPC handler 调用同一个导出函数，禁止内联业务逻辑

### AC2：IPC 协议扩展完整
- `IPC_CHANNELS` 包含本 Story 涉及的 9 个领域全部新增通道
- 每个通道有 TypeScript 类型契约（请求 / 响应 schema）

### AC3：客户端适配器统一
- `packages/core/src/lib/integrations/electron/services/<domain>.ts` 提供与原 HTTP 调用同名 / 同语义的方法
- 调用点（page、hook、component）通过统一 import 不感知传输层差异

### AC4：双版本零回归
- `npm run dev`（Web）功能完全不变，所有 route.ts 保持可用
- `npm run electron:dev`（CE）所有领域调用走 IPC，关闭 next dev 后核心功能仍可运行（Phase 3）

### AC5：SSE 流式 IPC 化
- `/api/collaboration/sessions/[id]/events`、`/api/agent/sessions/[sessionId]/messages`（SSE）等流式接口在 CE 模式改为 `webContents.send` 推送
- Renderer 通过 `ipcRenderer.on(channel, listener)` 订阅，API 表面与 EventSource 等价

### AC6：性能指标
- CE 模式 IPC 调用 P50 延迟 < 5ms，P95 < 20ms（对比 HTTP 50-200ms）
- Collaboration / Agent 流式事件端到端延迟 < 50ms

---

## 📚 文档导航

- [需求文档](./requirements.md) - 功能需求与验收标准
- [架构设计](./architecture.md) - 架构设计与数据结构
- [实施文档](./implementation.md) - 开发步骤与代码变更

---

## 🔗 相关文档

- [Epic 10 概述](../README.md)
- [Story 10.3: 本地文件系统直连](../story-10.3/README.md)
- [Story 10.4: 本地 Agent Runtime](../story-10.4/README.md)
- [Story 10.8: Monorepo 容器边界清理](../story-10.8/README.md)
- [CLAUDE.md 架构规约](../../../../CLAUDE.md)
