# 架构设计 - Story 9.25

**Story:** 子进程复用机制（Agent Pool）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 技术栈

- TypeScript
- Node.js 子进程管理
- 进程间通信（IPC）

---

## 数据结构

### AgentProcessEntry

```typescript
interface AgentProcessEntry {
  process: AgentProcess;
  reuseKey: string;
  refCount: number;
  lastAccessedAt: number;
  activePrompts: number;
}
```

### AgentSpawner 接口变更

```typescript
class AgentSpawner {
  // 旧 API
  spawn(config, onEvent) → spawn(config, reuseKey, onEvent)

  // 新增 API
  getOrCreate(config, reuseKey, onEvent) → Promise<AgentProcess>  // 复用或新建
  releaseRef(reuseKey) → void                                     // 引用计数 -1
  cleanup(timeoutMs?) → number                                    // 清理空闲进程
  stopByReuseKey(reuseKey) → Promise<void>                        // 按 key 停止
  list() → Array<{ reuseKey, refCount, status, activePrompts }>   // 统计
  getStats() → { total, totalRefs, totalActive }                  // 总体统计
}
```

### Worker 新增命令

```typescript
// set_system_prompt — 热更新 systemPrompt
{ type: "set_system_prompt", systemPrompt: "..." }
```

---

## 模块设计

### 架构流程

```
调用方 (SkillDialog/AgentLauncher/RoleAgentLauncher)
  ↓ reuseKey = "skill:ontology-builder"
AgentManager.getOrCreateAgent(sessionId, projectId, { reuseKey })
  ↓
CollaborationAgentBridge(config.reuseKey)
  ↓
AgentSpawner.getOrCreate(config, reuseKey, onEvent)
  ├─ 首次 → spawn 新进程，refCount=1
  └─ 复用 → 返回已有进程，refCount++
  ↓
AgentProcess (子进程: npx tsx agent-worker.mts)
  ├─ 多个 session 共享
  ├─ 消息顺序执行
  └─ systemPrompt 可热更新
```

---

## 代码变更

### 修改文件

```
src/modules/collaboration-runtime/sandbox/agent-spawner.ts        # MODIFY — 复用 key + 引用计数
src/lib/collaboration-runtime-bridge/agent-bridge.ts               # MODIFY — setSystemPrompt + 释放引用
src/modules/collaboration-runtime/sandbox/agent-worker.mts         # MODIFY — set_system_prompt 命令
src/lib/integrations/pi-agent/agent-manager.ts                     # MODIFY — 传入 reuseKey
src/app/api/agent/projects/[projectId]/messages/route.ts           # MODIFY — spawn 新签名
src/app/api/agent/projects/[projectId]/start/route.ts              # MODIFY — spawn 新签名
src/modules/collaboration-runtime/sandbox/__tests__/agent-spawner.test.ts  # MODIFY — 新 API 测试
```

### 设计要点

1. **复用 key 计算**：按来源（Project/Agent/Skill/Session）生成唯一 key
2. **引用计数**：`refCount` 跟踪使用中的 session 数量
3. **空闲超时**：超过 5 分钟无引用自动释放
4. **systemPrompt 热更新**：后续 session 可更新配置
5. **顺序执行**：同一 reuseKey 的消息排队执行
