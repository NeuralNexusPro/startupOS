# 架构设计 - Story 9.6

**Story:** PI Agent 桥接与子进程入口
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 技术栈

- TypeScript 严格模式
- Node.js 子进程（stdio 通信）
- `@anthropic-ai/sandbox-runtime` 沙箱包装
- JSON Line 事件流

## 数据结构

### 跨进程通信协议

- **stdin 指令**：`initialize` / `prompt` / `abort` / `shutdown`
- **stdout 事件**：`JSON.stringify(event) + '\n'`（JSON Line 格式）

### 组件迁移映射

| 组件 | 迁移目标 |
|------|---------|
| PersistentAgent, OriginOSAgent | 子进程（逻辑不变） |
| CognitiveManager, PracticeLogger | 子进程（逻辑不变） |
| 文件加载 + prompt 构建 | 子进程（逻辑不变） |
| HealthMonitor, 工具初始化 | 子进程（逻辑不变） |
| PersistentAgentManager | Runtime 层（生命周期调度器） |
| agentSessionService | Runtime 层（Session Service） |

## 模块设计

### Agent Worker 子进程

**文件：** `src/lib/integrations/pi-agent/agent-worker.ts`

### Agent Spawner（Runtime 侧）

**文件：** `src/modules/collaboration-runtime/sandbox/agent-spawner.ts`

## 代码变更

- 新增 `agent-worker.ts`：Agent 子进程入口，接收 stdio 指令，输出 JSON Line 事件
- 新增 `agent-spawner.ts`：Runtime 侧子进程管理器，启动/监控/解析子进程事件
- 迁移现有 prompt 构建逻辑到子进程
- `agentSessionService` 改为通过 Runtime 中转
