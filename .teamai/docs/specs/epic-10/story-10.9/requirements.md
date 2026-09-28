# 需求文档 - Story 10.9

**Story:** Next.js HTTP API → Electron IPC 服务化迁移
**Epic:** 10 - OriginOS CE 客户端
**最后更新:** 2026-06-12

---

## 📋 概述

CE（Electron Desktop）版本目前仍依赖本地启动的 Next.js dev server 提供后端能力，所有业务调用都走 `fetch('/api/...')` → `route.ts` 处理器。这一架构在 10.3（FS 直连）和 10.4（Agent Runtime）中已经在两个领域局部解耦，但**剩余 ~106 个 `route.ts` 文件仍紧耦合 Next.js**，CE 版本在以下场景表现异常：

- **离线场景**：Next.js 未启动 → 所有非 FS / Agent 调用失败
- **冷启动延迟**：Electron 必须等待 `next dev` 端口可用才能渲染首页
- **进程隔离不彻底**：业务逻辑分散在 `route.ts`（HTTP 边界）和 `@originos/core`（业务核心）两侧
- **CE 分发体积**：打包必须携带 Next.js runtime + node_modules，体积膨胀
- **架构一致性缺口**：仅 FS / Agent 两个领域走 IPC，其余领域仍依赖 HTTP，违反 Epic 10 "本地直连" 核心目标

### 当前耦合状态（截至 2026-06-13）

| 领域 | route.ts 数量 | 业务逻辑归属 | IPC 化进度 |
|------|--------------|------------|----------|
| 文件系统（files/workspace） | 5 | `@originos/core/lib/storage` | ✅ Story 10.3 已覆盖（部分） |
| Agent 会话 | 14 | `@originos/core/lib/integrations/pi-agent` | ✅ Story 10.4 已覆盖（部分） |
| Skill | 11 | `@originos/core/lib/integrations/pi-agent`、`features/skills` | ✅ 10.9.3 基础迁移完成 |
| Project | 18 | `@originos/core/lib/features/projects` | ✅ 10.9.4 基础迁移完成 |
| Ontology | 13 | `@originos/core/lib/features/ontology`、`ontology-data-store` | ✅ 10.9.5 基础迁移完成 |
| Collaboration（含 SSE） | 9 | `@originos/core/modules/collaboration-runtime` | ✅ 10.9.6 基础迁移完成 |
| User-agents / User-skills | 4 | `@originos/core/lib/features/user-registry` | ✅ 10.9.8 list/get/delete 完成 |
| Interview | 7 | `@originos/core/lib/features/ontology` interview service | ✅ 10.9.9 基础迁移完成 |
| Notification / Taste / Debug | 8 | `@originos/core/lib/features/*` | ✅ 10.9.9 基础迁移完成 |
| 其他（launch、sandbox 等） | 5 | 杂项 | ✅ 10.9.9 基础迁移完成 |
| **合计** | **~94**（不含已迁移） | — | — |

> 说明：已通过 `read skill-evolution/route.ts` 验证业务逻辑全部归属 `@originos/core`，`route.ts` 仅做 HTTP 转译，符合服务化迁移前置条件。

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

## ⚠️ 风险与缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| IPC 通道爆炸（>100 个） | 维护成本高 | 按领域命名空间组织，使用类型化 channel registry，集中导出 |
| 大文件 upload 通过 IPC 传递占用内存 | 性能风险 | 当前受 10MB 上传上限约束；后续可升级为 Electron 文件路径 copy |
| SSE → IPC 语义偏差（事件 ID、retry、heartbeat） | 流式订阅丢事件 | `createIpcEventStream` 内置 sequence + ack；renderer 重连时按 sequence 续传 |
| route.ts 保留 → 业务逻辑双向漂移 | 长期维护风险 | 强约束：route.ts 与 IPC handler 必须 import 同一函数；CI lint 检查内联业务代码 |
| Web 模式回归 | 已有用户受影响 | 双轨运行期间 route.ts 全部保留；E2E 在 Web 模式下持续跑 |

---

## 🔗 相关文档

- [Epic 10 概述](../README.md)
- [Story 10.3: 本地文件系统直连](../story-10.3/README.md)
- [Story 10.4: 本地 Agent Runtime](../story-10.4/README.md)
- [Story 10.8: Monorepo 容器边界清理](../story-10.8/README.md)
- [CLAUDE.md 架构规约](../../../../CLAUDE.md)
