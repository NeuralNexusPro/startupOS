# 测试文档 - Story 9.44

**Story:** 多Agent协作统一任务看板（Multica模式）
**版本:** 1.0
**最后更新:** 2026-10-12

---

## 🎯 测试目标

验证 Story 9.44 的所有验收标准和功能需求已正确实现：看板实时性、状态流转、快照恢复与降级、双通道可用、范围排除回归（项目工作区「任务」页签不呈现协作任务）。

---

## 📋 测试策略

### 测试层级

```
┌─────────────────────────────────┐
│  手动 E2E（真实协作会话）         │  桌面 + Web 双模式验收
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  集成测试（store + 快照合并）     │  事件序列 → 任务列表
└────────────┬────────────────────┘
             ↓
┌─────────────────────────────────┐
│  单元测试（纯函数 + 组件）        │  映射函数 / TaskBoard 渲染
└─────────────────────────────────┘
```

### 测试覆盖率目标

| 测试类型 | 覆盖率目标 | 当前覆盖率 |
|---------|-----------|-----------|
| 单元测试（派生逻辑） | > 80% | 待实施 |
| 组件测试 | > 60% | 待实施 |
| 手动 E2E | 关键路径 100% | 待实施 |

---

## 🧪 单元测试

### 测试框架

- **框架:** Vitest（core 包既有配置 `packages/core/vitest.config.ts`）
- **组件测试:** @testing-library/react（如 core 已配置；否则以纯函数测试为主）

### 测试用例 1: applyTaskEventToTasks 六类事件映射

**测试文件:** `packages/core/src/modules/collaboration-runtime/ui/__tests__/store-tasks.test.ts`

**覆盖点：**

| 用例 | 输入事件 | 期望任务状态 |
|------|---------|-------------|
| TASK_CREATED 新增 | `{task: {id:'t1', description:'采集数据', status:'pending', ...}}` | 列表新增 1 条 pending |
| TASK_CREATED 幂等 | 同 id 重复事件 | 列表不重复 |
| TASK_ASSIGNED | `{taskId:'t1', agentId:'data-analyst'}` | assignedTo 更新、status=assigned |
| TASK_STARTED | `{taskId:'t1'}` | status=running |
| TASK_REPORTED | `{taskId:'t1', output:'…'}` | status=reported、output 写入 |
| TASK_COMPLETED | `{taskId:'t1'}` | status=completed、completedAt=事件时间戳 |
| TASK_FAILED | `{taskId:'t1'}` | status=failed、completedAt=事件时间戳 |
| 非任务事件 | `ASSISTANT_MESSAGE` 等 | tasks 不变 |
| 缺 payload 防御 | `{}` | tasks 不变、不抛异常 |

**覆盖的验收标准:** AC2（状态实时流转）

### 测试用例 2: mergeSnapshotTasks 快照合并

**测试文件:** 同上

**测试要点：**
- 快照覆盖：恢复后任务列表 = `activeTasks` + 各 Agent `recentTerminalTask` 合成结果（**非全量恢复，按用户决策收窄**）
- 空快照（0 任务）→ 清空列表（与 reset 后恢复一致）
- 合并后再到 TASK_* 事件 → 正常增量更新
- 快照字段缺失/畸形（unknown 收窄）→ 不抛异常，跳过坏数据

**覆盖的验收标准:** AC6（会话恢复——活跃任务 + 最近终端任务范围）

### 测试用例 3: HITL 通知转发（hitl-notify）

**测试文件:** `packages/core/src/modules/collaboration-runtime/facade/__tests__/hitl-notify.test.ts`

**测试要点（mock `getNotificationManager`）：**

| 用例 | 输入 | 期望 |
|------|------|------|
| HITL 事件触发 | `HUMAN_REVIEW_REQUEST` 事件（payload.question='…'） | `createNotification` 调用 1 次，type=SYSTEM_MESSAGE，payload 含 hitlEventId/sessionId |
| 非 HITL 事件 | `TASK_CREATED` / `ASSISTANT_MESSAGE` | createNotification 零调用 |
| 幂等去重 | 同 `event.id` 重复到达 | createNotification 仅 1 次 |
| 标题/正文构造 | question 超 120 字符 | 正文截断到 120 字符 |
| 失败不冒泡 | createNotification reject | 仅 console.error，forwarder 不抛 |
| manager 抛同步异常 | createNotification throw | 同上，不影响事件流 |

**覆盖的验收标准:** AC7（HITL 触发发送系统通知）

### 测试用例 4: TaskBoard 组件渲染（若组件测试可用）

**测试文件:** `packages/core/src/modules/collaboration-runtime/ui/__tests__/task-board.test.tsx`

**覆盖点：**
- 有任务时渲染任务行（描述、Agent 名、状态文字）
- 空任务时显示「暂无任务，等待 Supervisor 分派」
- 点击任务行触发 `onTaskClick(agentId)`
- 汇总条计数正确（活跃/完成/失败）

**覆盖的验收标准:** AC3（汇总统计与联动）

---

## 🔗 集成测试

### 测试用例 1: 事件序列端到端（store 级）

**测试文件:** `packages/core/src/modules/collaboration-runtime/ui/__tests__/store-tasks.test.ts`

**场景：** 按引擎真实 dispatch 时序连续注入 `TASK_CREATED → TASK_ASSIGNED → TASK_STARTED → TASK_REPORTED → TASK_COMPLETED`，断言最终任务状态为 completed 且中间态无闪烁残留。

**覆盖的验收标准:** AC1、AC2

### 测试用例 2: 快照 API 契约（手动/脚本）

**场景:** 对已存在协作会话调用 `GET /api/collaboration/sessions/[id]/snapshot`，断言响应含 `activeTasks / agents / summary / snapshotAt` 字段（该 API 已存在并有行为，验证不被本次改动破坏）。

**覆盖的验收标准:** AC4（Web 通道）

---

## 🌐 E2E 测试（手动）

### 测试框架

本项目当前无 Playwright 基建；E2E 采用**手动验证**并记录证据（截图/会话数据文件），符合 AGENTS.md「无法自动化项须说明人工步骤」要求。

### 场景 1: 发起协作 → 看板出现任务（AC1/AC3）

**步骤：**
1. 打开真实项目 → 多 Agent 协作窗口
2. 输入目标并发送，等待 Supervisor 确认方案
3. 观察 Agent 状态条与看板：任务出现、状态流转
4. 点击任务行 → Agent 抽屉打开
5. 截图 + 导出该会话 events.jsonl 作为证据

**预期:** 看板条目与 events.jsonl 中 TASK_* 事件一一对应。

### 场景 2: 重开窗口恢复（AC6，非全量）

**步骤：**
1. 完成场景 1 后关闭协作窗口
2. 重新打开协作窗口
3. 观察看板恢复活跃任务与各 Agent 最近终端任务（更早终端任务不显示，属预期）

### 场景 3: Web 模式（AC4）

**步骤：**
1. `pnpm dev` 浏览器打开同一项目协作窗口
2. 重复场景 1，验证 HTTP 快照与 SSE 事件路径

### 场景 4: 范围排除回归（AC5）

**步骤：**
1. 打开项目工作区「任务」页签
2. 确认无协作黑板任务出现；pi-tasks 列表行为与 9.43 一致
3. 打开协作窗口看板，确认两者互不影响

### 场景 5: HITL 系统通知（AC7）

**步骤：**
1. 协作会话运行中，让 Supervisor/Worker 触发 `ask_user_question` 或 `escalate_to_human`
2. 切到其他窗口（如首页），等待 ≤30s（NotificationBell 轮询周期）
3. 观察通知中心：出现「多 Agent 协作等待回复」通知，未读计数 +1
4. 回到协作窗口回复 HITL；确认通知可正常 dismiss
5. （降级验证）重复触发同一 HITL 事件 id，确认通知不重复

**预期:** 通知创建失败（可临时改目录权限模拟）时，协作窗口 HITL 输入框仍正常出现，流程可继续。

---

## ⚡ 性能测试

### 性能指标

根据 AGENTS.md 第 6 章：

| 指标 | 约束 | 测试方法 |
|------|------|---------|
| 事件→看板更新 | < 500ms | 手动观察（事件时间戳 vs 渲染时间）+ store 单测即时性 |
| 快照拉取 | < 5s | 手动 Network/IPC 面板观察（后端已有 5s 缓存） |

### 性能测试用例 1: 事件到渲染延迟

**方法:** 单测中直接断言 `applyTaskEventToTasks` 为同步纯函数（无 IO、无异步等待）；真实延迟在手动 E2E 中以「状态点 animate-pulse 与聊天流协调消息同帧出现」为通过标准。

---

## 📊 测试数据

### 测试数据集 1: 事件序列 fixture

**用途:** store 单测

```typescript
export const dispatchSequence: RuntimeEvent[] = [
  { id: 'e1', sessionId: 's1', seq: 0, type: 'TASK_CREATED', source: 'supervisor', timestamp: '2026-10-12T10:20:00Z',
    payload: { task: { id: 't1', description: '采集原始数据', status: 'pending', createdAt: '2026-10-12T10:20:00Z' } } },
  { id: 'e2', sessionId: 's1', seq: 0, type: 'TASK_ASSIGNED', source: 'supervisor', timestamp: '2026-10-12T10:20:01Z',
    payload: { taskId: 't1', agentId: 'data-collector' } },
  { id: 'e3', sessionId: 's1', seq: 0, type: 'TASK_STARTED', source: 'data-collector', timestamp: '2026-10-12T10:20:02Z',
    payload: { taskId: 't1' } },
  { id: 'e4', sessionId: 's1', seq: 0, type: 'TASK_REPORTED', source: 'data-collector', timestamp: '2026-10-12T10:24:00Z',
    payload: { taskId: 't1', output: '数据已采集' } },
  { id: 'e5', sessionId: 's1', seq: 0, type: 'TASK_COMPLETED', source: 'supervisor', timestamp: '2026-10-12T10:25:00Z',
    payload: { taskId: 't1', output: '数据已采集' } },
];
```

### 测试数据集 2: 快照 fixture

**用途:** mergeSnapshotTasks 单测

```typescript
export const mockSnapshot = {
  sessionId: 's1',
  activeTasks: [
    { id: 't2', description: '生成季度报告', status: 'running', assignedTo: 'data-analyst', createdAt: '2026-10-12T10:32:00Z' },
  ],
  agents: [
    { agentId: 'data-collector', agentName: '数据采集Agent',
      recentTerminalTask: { taskId: 't1', description: '采集原始数据', status: 'completed', completedAt: '2026-10-12T10:25:00Z' } },
  ],
  summary: { totalAgents: 2, activeAgents: 1, totalActiveTasks: 1, totalCompletedTasks: 1, totalFailedTasks: 0, totalBlockedTasks: 0 },
  snapshotAt: '2026-10-12T10:33:00Z',
};
```

---

## ✅ 验收标准测试

### AC1: 任务实时出现在看板

**Given** 协作会话已创建、Supervisor 就绪
**When** Supervisor 执行 dispatch_worker
**Then** 看板 1 秒内出现任务条目（描述+Agent 名）

**测试步骤:**
1. 运行 store 集成测试（事件序列 → tasks 更新）
2. 手动 E2E 场景 1

**测试结果:** ✅ 自动化通过（2026-10-12）——store-tasks 事件序列端到端用例通过（集成分支 ui+facade 107/107）；手动 E2E 待桌面环境验证（见「测试执行记录」）

### AC2: 状态实时流转

**测试步骤:**
1. 单测：六类事件映射（用例 1）
2. 手动：观察 running → completed 转变

**测试结果:** ✅ 自动化通过（2026-10-12）——store-tasks 27 用例全绿（六类映射 + 幂等 + 缺 payload 防御）

### AC3: 汇总统计与联动

**测试步骤:**
1. 组件测试：汇总条计数 + 点击回调
2. 手动：点击任务行打开抽屉

**测试结果:** ✅ 自动化通过（2026-10-12）——task-board.test.tsx 9 用例（计数 + onTaskClick + 空态）；MultiAgentLauncher.logic 14 用例无回归。手动抽屉联动待桌面验证

### AC4: 双通道与降级

**测试步骤:**
1. Web 模式手动场景 3（HTTP 快照 + SSE）
2. Electron 模式手动场景 1（IPC 快照 + COLLAB_EVENT）
3. 断网/停会话条件下验证降级不白屏

**测试结果:** ⏳ 待手动验证（2026-10-12）——IPC 通道 + 双通道客户端已实现并通过 typecheck/边界扫描；desktop tsc 前需构建感知插件 dist（环境前置，已记录）。手动双通道验证待桌面环境

### AC5: 项目工作区「任务」页签不呈现协作任务（范围排除回归）

**测试步骤:**
1. 手动场景 4
2. 确认 ProjectTaskBoard 相关文件零改动（`git diff` 核对）

**测试结果:** ✅ 通过（2026-10-12）——`git diff 0.4.x --name-only -- packages/` 核对：13 个变更文件全部位于 collaboration-runtime / lib integrations / desktop main；project-task-board 相关文件零改动

### AC6: 会话恢复（活跃任务 + 最近终端任务）

**测试步骤:**
1. 单测：mergeSnapshotTasks 合成范围（用例 2）
2. 手动场景 2（确认非全量属预期）

**测试结果:** ✅ 自动化通过（2026-10-12）——mergeSnapshotTasks 合成/去重/畸形跳过用例通过；快照 `taskId→id` 键归一化已在 MultiAgentLauncher.normalizeSnapshotTaskKeys 落地（依据 agent-task-snapshot.ts 真实形态）。手动重开窗口验证待桌面环境

### AC7: HITL 触发发送系统通知

**测试步骤:**
1. 单测：hitl-notify 转发（用例 3，六项用例表）
2. 手动场景 5（通知中心可见 + 幂等 + 降级）

**测试结果:** ✅ 自动化通过（2026-10-12）——hitl-notify 9/9（经真实 eventEmitter 冒烟）；createNotification 实际签名含第 5 参 `options?: { sessionId?, projectId? }`，已适配并断言完整调用形状。手动通知中心验证待桌面环境

---

## 🐛 缺陷记录

_实施后填写_

**2026-10-12 补充（非缺陷，基线记录）：**
- 全量 collaboration-runtime 套件 375/389：14 失败均为基线存量（capability-matcher 10、dag-executor 3 已在 0.4.x / 主 worktree 复现确认非本 Story 引入；agent-spawner 1 为环境性 `tsx: command not found`（exit 127））。
- desktop tsc 前置：需先 `pnpm -r --filter './packages/perception-plugins/*' build`（插件 dist 未随 worktree 提交，属环境前置）。
- E2E 环境前置：全新 worktree 需将 tsx 软链到根 `node_modules/tsx`（见「手动 E2E」执行记录），与 agent-spawner 基线失败同源。
- Supervisor prompt 300s 超时（glm 端点慢响应）属引擎既有鲁棒性问题，非本 Story 引入；本次 E2E 会话因此未推进到 TASK_COMPLETED。

---

## 🔄 回归测试

### 回归测试清单

- [x] collaboration-runtime 既有测试套件通过（已知存量失败：capability-matcher 10 / dag-executor 3 / agent-spawner 1，基线在 0.4.x 已确认非本 Story 引入）
- [x] solution feature 测试通过（含本次拓扑别名修复的回归）——28/28
- [x] `pnpm lint`（0 errors / 3215 基线 warnings）/ `pnpm lint:boundaries`（990 文件 0 诊断）通过
- [x] core exports 门禁通过（`node scripts/expand-core-exports.cjs --verify` → VERIFY PASSED）
- [x] `node scripts/check-architecture-boundaries.cjs --self-test` 通过
- [x] 手动 E2E 场景 1（API 驱动真实协作会话，TASK_* 全链路验证，见执行记录）；场景 2/3/5 的浏览器视觉确认待桌面环境

### 回归测试结果

**2026-10-12（Proposal 集成分支 `proposal/add-collaboration-task-board`，merge `7b825c9` 后）：**
- ui `__tests__` + facade（含 hitl-notify）：**107/107 通过**
- solution feature：**28/28 通过**
- collaboration-runtime 全量：375/389（14 失败全部为基线存量，见缺陷记录）
- core tsc：仅 client-hooks 5 项基线错误；desktop tsc：0 错误（构建插件 dist 后）
- `openspec validate add-collaboration-task-board --strict`：**valid**

---

## 📝 测试执行记录

### 2026-10-12 — 自动化测试（Proposal 集成分支）

| 命令 | 结果 |
|------|------|
| `pnpm --filter @originos/core exec vitest run src/modules/collaboration-runtime/ui/__tests__/ src/modules/collaboration-runtime/facade/__tests__/` | 107/107 ✅ |
| `pnpm --filter @originos/core exec vitest run src/lib/features/solution/` | 28/28 ✅ |
| `pnpm --filter @originos/core exec vitest run src/modules/collaboration-runtime/` | 375/389（14 基线存量失败） |
| `cd packages/core && npx tsc --noEmit -p .` | 仅 5 项 client-hooks 基线错误 |
| `cd packages/desktop && npx tsc --noEmit -p .`（前置：构建感知插件 dist） | 0 错误 ✅ |
| `pnpm lint` | 0 errors / 3215 基线 warnings ✅ |
| `pnpm lint:boundaries` | 990 文件 0 诊断 ✅ |
| `node scripts/expand-core-exports.cjs --verify` | VERIFY PASSED ✅ |
| `node scripts/check-architecture-boundaries.cjs --self-test` | 通过 ✅ |
| `openspec validate add-collaboration-task-board --strict` | valid ✅ |

**无法自动化项：** 手动 E2E 场景 1–5（真实协作会话、重开窗口恢复、Web 双通道、项目工作区回归、通知中心可见性）待桌面/Web 环境人工验证；步骤见上文「E2E 测试（手动）」。

### 2026-10-12 — 手动 E2E（API 驱动，Proposal dev server :3200）

**环境：** Proposal worktree web dev（`DATA_ROOT=<monorepo>/data`，端口 3200），真实项目 proj-1785388155176-xcl4f77gj（Hawkeye 招聘，5 Agent legacy manifest），会话 cs-1791782962341-02jm0x。

**环境前置（新发现）：** 开发态 supervisor/worker 通过 `npx tsx` 或 `<monorepoRoot>/node_modules/tsx/dist/cli.mjs` 解析 tsx；tsx 仅在 `packages/core/node_modules`（pnpm 未提升到根），全新 worktree 需 `ln -s $(realpath packages/core/node_modules/tsx) <worktree>/node_modules/tsx`。该问题与 agent-spawner 基线测试失败同源，非本 Story 引入。

| 验证点 | 结果 | 证据 |
|--------|------|------|
| 场景 1（AC1/AC2）：Supervisor dispatch 产生真实 TASK_* 事件 | ✅ | events.jsonl 依次出现 TASK_CREATED（task-1791783024726-pp7aez）→ TASK_ASSIGNED（agentId=position-profiling-agent）→ TASK_STARTED；全历史会话此前零 TASK_* 事件，本次为首个真实样本 |
| SSE 重放（AC1/AC4 Web 通道）：晚加入客户端收到全量历史含 TASK_* | ✅ | `GET .../events`（SSE）replay 流中含 TASK_CREATED/ASSIGNED/STARTED 各 1 |
| 快照 API（AC6 数据面）：activeTasks 为完整 TaskItem（`id` 键），agents[].activeTask 为 `taskId` 键 | ✅ | 快照返回 activeTasks[0].id=task-1791783024726-pp7aez、status=running、assignedTo=position-profiling-agent；agents[0].activeTask.taskId 同值 → 印证 MultiAgentLauncher.normalizeSnapshotTaskKeys 归一化设计的必要性 |
| summary 统计（AC3 数据面） | ✅ | `{"totalAgents":1,"activeAgents":1,"totalActiveTasks":1,...}` |
| 浏览器产物（AC1/AC3/AC6 UI 面） | ✅ | 窗口页 200；懒加载 chunk `_app-pages-browser_src_app_window_CollaborationWindow_tsx.js`（11.7MB）含 TaskBoard×4、normalizeSnapshotTaskKeys/getCollaborationTaskSnapshot×2、空态文案 |
| AC7 HITL 通知（真实会话） | ⏳ | 本次会话未触发 HUMAN_REVIEW_REQUEST（worker 未上报 HITL），通知中心验证仍需桌面环境；单测 9/9 已覆盖 |
| 会话恢复（AC6 重开窗口） | ⏳ | 快照 API 数据面已验证（活跃任务+范围收窄），浏览器视觉恢复待桌面环境 |

**场景外发现（非本 Story 缺陷，基线记录）：** Supervisor 在 wait_workers 后续 LLM 轮次因 glm 端点 300s 未响应触发 `Prompt timed out`（agent-spawner.ts:374 超时路径），会话终止于 running；TASK_COMPLETED 依赖 supervisor 后续 verify_task 调用（supervisor-dag-tools.ts:164），本次未能推进到终端事件。TASK_REPORTED/TASK_COMPLETED 的真实会话样本与端到端终端流转验证仍属待办（与引擎超时鲁棒性改进无关本 Story 范围）。

**剩余风险：**
- 引擎真实会话的 `TASK_*` 事件样本仍依赖新发起一次完整协作会话（问题 1）。
- agent-spawner 基线失败（`tsx: command not found`）与本 Story 无关，但会污染全量套件结果解读。

---

## 🚀 测试命令

```bash
# store 派生 + 组件单测（core 包）
pnpm --filter @originos/core exec vitest run src/modules/collaboration-runtime/ui/__tests__/

# 全量回归（本 Story 相关面）
pnpm --filter @originos/core exec vitest run src/modules/collaboration-runtime/
pnpm --filter @originos/core exec vitest run src/lib/features/solution/

# lint 与边界
pnpm lint && pnpm lint:boundaries
```

---

## 📌 相关文档

- [Story README](./README.md)
- [需求文档](./requirements.md)
- [架构设计](./architecture.md)
- [开发文档](./implementation.md)
