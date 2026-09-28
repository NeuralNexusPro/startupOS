# 需求定义 - Story 9.6

**Story:** PI Agent 桥接与子进程入口
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-17

---

## 用户故事

> 作为系统，我需要将现有 PI Agent 的运行从 Next.js 进程迁移到独立的沙箱子进程中，通过 stdio 与 Runtime 通信，这样 LLM 调用不再阻塞 Next.js 事件循环。

---

## 功能需求

### Agent Worker 子进程（入口）

**文件：** `src/lib/integrations/pi-agent/agent-worker.ts`

1. 通过 stdio 接收 Runtime 指令：
   - `initialize` → 读取 Agent.md/Tool.md/Skill.md → 构建 prompt → 创建 PersistentAgent
   - `prompt` → 调用 LLM → 输出事件流到 stdout
   - `abort` → 中断当前操作
   - `shutdown` → 清理并退出
2. 事件通过 `stdout.write(JSON.stringify(event) + '\n')` 输出
3. 现有 prompt 构建逻辑（`buildProjectPromptLayers`, `assembleProjectPrompt`）在子进程中运行
4. CognitiveManager hooks 在子进程中运行

### Runtime 侧（Agent Spawner）

**文件：** `src/modules/collaboration-runtime/sandbox/agent-spawner.ts`

1. 通过 `@anthropic-ai/sandbox-runtime` 包装启动 Agent 子进程
2. stdio 管道建立（stdin/stdout/stderr）
3. 心跳检测 + 自动重启
4. 解析子进程 stdout 的 JSON Line 事件 → 转为 RuntimeEvent

### 迁移清单（来自设计文档 §2.1.1）

**移到子进程的组件（逻辑不变）：**
- `PersistentAgent`, `OriginOSAgent`, `@mariozechner/agent`, `@mariozechner/pi-ai`
- `CognitiveManager`, `PracticeLogger`, `KnowledgeProvider`, `PatternProvider`
- 文件加载（`loadWorkspaceFiles` 等）+ prompt 构建
- `HealthMonitor`, `setToolContext`, `getAgentTools`, `initializeBuiltInTools`
- 模型配置逻辑

**移到 Runtime 层的组件：**
- `PersistentAgentManager` → Agent 生命周期调度器
- `agentSessionService` → Session Service

**需要新开发的跨进程逻辑：**
- `agentSessionService` 的跨进程调用 → 子进程通过 stdio 发事件 → Runtime 中转

## 边界条件

- 子进程崩溃不影响 Runtime 进程
- 沙箱权限正确限制子进程的文件访问

## 验收标准

- [ ] 单 Agent 通过子进程运行正常，对话无异常
- [ ] prompt 构建结果与迁移前一致（字符串对比）
- [ ] agent loop（prompt → tool_call → tool_result → loop）完整正常
- [ ] 子进程崩溃不影响 Runtime 进程
- [ ] stdio 事件流格式符合 RuntimeEvent 类型
- [ ] `agentSessionService.updateSession()` 通过 Runtime 中转完成
- [ ] 沙箱权限正确限制子进程的文件访问

## 依赖关系

- [设计文档 §2.1.1 PI Agent 组件映射](../../design/multi-agent-runtime.md#211-pi-agent-组件与三层架构映射)
- [现有 PersistentAgent](../../../src/lib/integrations/pi-agent/persistent-agent.ts)
- [现有 OriginOSAgent](../../../src/lib/integrations/pi-agent/core/agent.ts)
- [现有 PersistentAgentManager](../../../src/lib/integrations/pi-agent/persistent-agent-manager.ts)
