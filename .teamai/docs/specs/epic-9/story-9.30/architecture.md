# 架构设计 - Story 9.30

**Story:** Supervisor Agent 化（Supervisor as Real Agent）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 架构设计

### 核心设计思路

将 Supervisor 从 Next.js 进程内的无状态函数升级为真正的 Agent：
- 拥有独立子进程（与 Worker 同构）
- 拥有 7 层 system prompt（Identity 来自 Agent.md）
- 拥有记忆文件（Memory.md / Knowledge.md / Patterns.md）
- 通过 LLM 推理完成"目标分解 → 任务派发 → 状态监督 → 验收汇总"

### 架构层次

```
┌─────────────────────────────────────────────────┐
│  executeSupervisorDag(session, globalGoal)      │  ← 胶水层（函数签名不变）
│  - 加载 Agents.json + 拓扑                       │
│  - spawn supervisor 子进程                        │
│  - 监听工具调用并代为执行                          │
│  - 写入 finalReport.md                           │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Supervisor Agent 子进程                         │
│  - 7 层 system prompt（Layer 6 含协作上下文）     │
│  - 状态机：decomposing → dispatching → ...       │
│  - 工具集：dispatch_worker / wait_workers / ...  │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│  Worker Agent 子进程（多个）                      │
│  - 接收任务 prompt（三段式）                       │
│  - 执行任务并产出 artifact                        │
│  - 通过 WORKER_BLOCK 上报阻塞                     │
└─────────────────────────────────────────────────┘
```

---

## 技术栈

- **Agent 运行时**：agent-worker.mts（supervisor 模式分支）
- **Prompt 构建**：7 层分层 system prompt（与 RoleAgent 对齐）
- **工具注册**：沙箱内按需注入（supervisor 专属工具集）
- **子进程管理**：与 Worker 同构的 spawn / kill 机制
- **事件流**：events.jsonl（SUPERVISOR_* 事件类型）

---

## 数据结构

### Supervisor Agent 模板文件

```
data/agents/supervisor/
├── Agent.md          # 协调者身份与方法论
├── Role.md           # 状态机定义
├── Tool.md           # 工具白名单
├── Taste.md          # 风格指南
├── Memory.md         # 历史记忆
├── Knowledge.md      # 知识库索引快照
└── Patterns.md       # 经验模式索引快照
```

### Supervisor 状态机（Role.md）

```
decomposing → dispatching → monitoring → verifying → aggregating → completed
                                      ↓
                                  escalated → (等待用户) → monitoring
                                      ↓
                                    failed
```

### Supervisor 工具集

| 工具 | 签名 | 说明 |
|------|------|------|
| `dispatch_worker` | `(workerId, specificAction, acceptanceCriteria, dependsOn?)` | spawn / 复用 worker 子进程，返回 dispatchId |
| `wait_workers` | `(dispatchIds[], timeoutMs)` | 阻塞直到状态变化，返回 `{completed[], failed[], waiting[]}` |
| `cancel_worker` | `(dispatchId)` | 取消未完成派发 |
| `run_verifier` | `(taskId, criteria)` | 复用 9.29 verifier |
| `read_file` / `list_files` | — | 只读访问 worker 工作目录 |

**禁止工具**：`write_file` / `edit_file` / 本体写工具 / `execute_command`

### 事件类型（session/types.ts）

```typescript
// 新增事件类型
'SUPERVISOR_AGENT_START'
'SUPERVISOR_DECOMPOSITION'
'SUPERVISOR_DISPATCH'
'SUPERVISOR_AGGREGATE'
```

### Supervisor 产物目录

```
sessionDir/supervisor/
├── decomposition.md          # decomposing 阶段产出
├── memory/
│   ├── decisions.jsonl       # 决策日志（9.33 引入）
│   └── history.jsonl         # 与 worker Memory tracker 同构
└── finalReport.md            # aggregating 完成后产出
```

---

## 模块设计

### 1. Supervisor Agent 模板模块

**位置**：`data/agents/supervisor/`

**职责**：
- 定义 Supervisor 身份、状态机、工具白名单
- 支持项目级覆盖（`data/projects/{id}/agents/supervisor/`）

**关键文件**：
- `Agent.md`：协调者身份与方法论
- `Role.md`：8 状态状态机
- `Tool.md`：工具白名单（SUPA-03）

### 2. Supervisor 子进程启动模块

**位置**：`src/modules/collaboration-runtime/sandbox/agent-worker.mts`

**职责**：
- 新增 supervisor 模式分支
- 构建 7 层 system prompt（Layer 6 末尾追加协作上下文）
- 注册 supervisor 专属工具集

**关键变更**：
- 与 worker 模式同构（同样的 prompt 构建逻辑）
- Layer 6 追加：globalGoal、topology、agentCards、sessionDir

### 3. executeSupervisorDag 胶水层模块

**位置**：`src/lib/collaboration-runtime-bridge/multi-agent-executor.ts`

**职责**：
- 加载 Agents.json + 拓扑
- spawn supervisor 子进程
- 监听工具调用并代为执行
- 写入 finalReport.md

**关键变更**：
- 函数签名不变：`executeSupervisorDag(session, globalGoal)`
- 删除 `rewriteSubTaskGoal`
- 删除 `SupervisorMode.decompose()`
- 保留 `allocateAll` / `runVerifier` 作为工具内部实现

### 4. Supervisor 工具实现模块

**位置**：`src/modules/collaboration-runtime/engine/supervisor.ts`

**职责**：
- 实现 supervisor 工具的底层逻辑
- `allocateAll`：批量派发 worker
- `runVerifier`：执行验证器

**关键变更**：
- 删除 `decompose()` 方法
- 保留 `allocateAll` / `runVerifier` 作为工具实现细节

---

## 关键设计决策

### 决策 1：Supervisor 子进程化 vs 函数式

**选项**：
- (a) Supervisor 作为 Agent 跑在独立子进程（本 Story 采用）
- (b) 保留函数式，仅增强 LLM 动态分解

**决策理由**：
- 选项 (a) 提供可演进的协调底座
- 让 9.19 Queen-Led / 9.23 共识投票真正落地
- Supervisor 需要全局协作感知，只有 Agent 形态具备

### 决策 2：分解者身份

**旧方案**：`SupervisorMode.decompose()` 函数

**新方案**：Supervisor Agent 本身在 `decomposing` 状态一次性输出全部 SubTask

**决策理由**：
- 分解者需要全局协作感知
- 只有 Agent 形态具备上下文记忆和推理能力

### 决策 3：工具白名单严格受限

**规则**：
- Supervisor 仅允许只读访问 worker 工作目录（`read_file` / `list_files`）
- 禁止写文件、执行命令、本体写操作

**决策理由**：
- Supervisor 职责是协调，不是执行
- 防止 Supervisor 越权操作

### 决策 4：7 层 Prompt 结构

**Layer 6 协作上下文**：
```
【协作上下文】
- globalGoal: {全局目标}
- topology: {拓扑结构}
- agentCards: {Agent 能力卡片}
- sessionDir: {会话目录}
```

**决策理由**：
- 与 RoleAgent 7 层 prompt 对齐
- Layer 6 专门用于注入协作上下文

---

## 代码变更

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| NEW | `data/agents/supervisor/{Agent,Role,Tool,Taste,Memory,Knowledge,Patterns}.md` | 系统内置 supervisor 模板 |
| MODIFY | `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` | `executeSupervisorDag` 重写为胶水层；删除 `rewriteSubTaskGoal` |
| MODIFY | `src/modules/collaboration-runtime/sandbox/agent-worker.mts` | 注册 supervisor 工具集（dispatch_worker / wait_workers / run_verifier / bb_* / escalate_to_human） |
| MODIFY | `src/modules/collaboration-runtime/engine/supervisor.ts` | 删除 `decompose`；保留 `allocateAll` / `runVerifier` 作为 supervisor 工具内部实现 |
| MODIFY | `src/modules/collaboration-runtime/session/types.ts` | 新增 `SUPERVISOR_AGENT_START` 等事件类型 |
| NEW | `docs/design/supervisor-agent.md` | （已创建）本 Story 的源依据 |
| MODIFY | `docs/design/multi-agent-runtime.md` §5.3 | 把 Supervisor 描述更新为"Agent 形态" |
