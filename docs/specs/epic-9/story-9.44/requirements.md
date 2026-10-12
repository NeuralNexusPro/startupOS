# 需求文档 - Story 9.44

**Story:** 多Agent协作统一任务看板（Multica模式）
**版本:** 1.0
**最后更新:** 2026-10-12

---

## 📋 功能需求

### 来源

- 用户需求（2026-10-12）：「多 agent 协作这个应该跟 multica 的模式一样，用户发起的是一个任务，然后由 supervisor agent 根据 agent 协作关系去向对应的 agent 分配任务，向用户呈现统一的任务管理看板，可以看到是哪个 agent 在负责哪个任务，进度如何」
- Epic 9：多 Agent 协作运行时（Phase 3，UI 可见性缺口）
- Story 9.36 README 规划项：「UI 使用该快照展示 Agent 活动仪表盘」（936-T1 仅完成运行时接线，UI 未实施）

### 详细需求

#### FR1: 协作窗口任务看板（Multica 模式）

**描述：**
在「多 Agent 协作」窗口（`MultiAgentLauncher`）中新增任务看板区域。用户通过聊天输入发起协作目标后，Supervisor 依据 solution manifest 的 agents.json 协作拓扑通过 `dispatch_worker` 分派任务；每次分派产生的任务（`TaskItem`）在看板实时出现，展示：

- 任务描述（`description`）
- 负责 Agent（`assignedTo`，显示为 Agent 名称）
- 任务状态（`TaskState`：pending / assigned / running / reported / completed / failed）
- 时间信息（创建时间、完成时间）

**优先级：** 🔴 High

**依赖：**
- Story 9.36: `AgentTaskSnapshot` 快照机制、`TASK_*` 事件流、`/snapshot` API（均已就绪）
- 外部依赖: 无

#### FR2: 实时状态流转

**描述：**
看板数据随任务生命周期事件实时更新：`TASK_CREATED → TASK_ASSIGNED → TASK_STARTED → TASK_REPORTED → TASK_COMPLETED / TASK_FAILED`。事件驱动路径为第一优先级（SSE/IPC 推送），快照轮询作为兜底对账路径。

**优先级：** 🔴 High

**依赖：**
- 协作运行时事件总线（已存在，`eventEmitter.emit` + `COLLAB_EVENT` 通道）

#### FR3: 汇总统计与任务-Agent 联动

**描述：**
看板顶部显示汇总统计条：活跃任务数、已完成数、失败数（对应快照 `summary.totalActiveTasks / totalCompletedTasks / totalFailedTasks`）。点击看板中的任务条目或 Agent 标识时，打开该 Agent 的详情抽屉（复用现有 `WorkerDetailDrawer`），实现「哪个 Agent 在负责哪个任务、进度如何」的定位查看。

**优先级：** 🟡 Medium

**依赖：**
- FR1

#### FR4: 快照恢复与双通道读取（不做全量恢复）

**描述：**
- 协作窗口重新打开或页面刷新后，看板通过 `GET /api/collaboration/sessions/[id]/snapshot`（Electron 走 IPC 等价通道）恢复当前会话的任务状态，**仅恢复活跃任务 + 各 Agent 最近终端任务**（现有 `WorkspaceTaskSnapshot` 形态，不加字段、不改恢复源）。
- 全量历史任务恢复暂不支持，记为已知限制（用户决策 2026-10-12）；如需完整历史，用户可通过会话事件流回看。
- 数据获取必须走双通道抽象：Electron 模式走 IPC，Web 模式走 HTTP fetch，与现有 `services/collaboration.ts` 模式一致。
- 快照不可用（网络失败、会话不存在、接口报错）时，看板降级为纯事件驱动数据，不阻塞聊天主流程，不白屏。

**优先级：** 🟡 Medium

**依赖：**
- FR1

#### FR5: 范围排除——原项目工作区「任务」页签不呈现协作任务

**描述：**
本 Story **不修改** 项目工作区（ProjectWorkspace）「任务」页签的 `ProjectTaskBoard`（Story 9.43，pi-tasks 体系）。协作运行时黑板任务不出现在该页签；两套任务体系（协作黑板任务 vs pi-tasks）**不打通、不互串、不合并展示**。若未来需要打通，另立 Story。

**优先级：** 🔴 High（约束性需求）

**依赖：**
- 无

#### FR6: HITL 暂停时发送 OriginOS 系统通知

**描述：**
协作会话中任何来源（Supervisor 自身 `escalate_to_human` / `ask_user_question`，或 Worker 经 `HITL_ESCALATE` 直连路径）发出 `HUMAN_REVIEW_REQUEST` 事件时，系统在 OriginOS 通知中心创建一条系统通知（复用既有 `NotificationManager`，`NotificationType.SYSTEM_MESSAGE`），包含：

- 标题：包含发起方名称（如「多 Agent 协作等待你的回复」）
- 正文：HITL 问题摘要（截断）
- payload：`sessionId`、`projectId`、`hitlEventId`（用于追溯）

通知到达后由既有通知中心 UI 消费（`NotificationBell` 30s 轮询 + 未读计数）。通知创建失败（IO 异常等）只记录 `console.error`，**不得影响 HITL 挂起/恢复主流程**。

**优先级：** 🟡 Medium

**依赖：**
- 既有 `NotificationManager`（`packages/core/src/lib/integrations/pi-agent/notification-system.ts`，无新增基建）

---

## ✅ 验收标准

### AC1: 任务实时出现在看板

**Given** 用户已打开多 Agent 协作窗口并完成会话创建（Supervisor 已就绪）
**When** 用户发送协作目标且 Supervisor 执行 `dispatch_worker` 分派任务
**Then** 任务看板在 1 秒内出现对应任务条目（含任务描述与负责 Agent 名称）
**And** 无需用户刷新页面或手动拉取

**测试数据：**
- 输入: 协作目标「分析项目数据并生成报告」
- 预期输出: 看板出现至少 1 条任务，assignedTo 为对应 Worker Agent 名称，状态为 assigned/running

### AC2: 状态实时流转

**Given** 看板上已存在一条状态为 running 的任务
**When** 对应 Worker 完成并通过验收（引擎发出 `TASK_COMPLETED`）
**Then** 看板该任务状态更新为已完成（含完成时间）
**And** 失败路径（`TASK_FAILED`）同样实时更新为失败态

### AC3: 汇总统计与联动

**Given** 会话中存在多个任务（活跃、已完成、失败混合）
**When** 用户查看看板顶部汇总条并点击某个任务条目
**Then** 汇总条正确显示活跃/已完成/失败计数
**And** 点击后打开对应 Agent 的详情抽屉，抽屉内可见该 Agent 的事件轨迹

### AC4: 双通道与降级

**Given** 分别在 Electron 桌面模式与 Web 浏览器模式下打开协作窗口
**When** 会话产生任务数据
**Then** 两种模式下看板均可正常展示（IPC 与 HTTP 各自可用）
**And** 快照接口失败时看板仍基于事件流正常展示（控制台有错误日志，UI 无白屏无崩溃）

### AC5: 项目工作区「任务」页签不呈现协作任务（范围排除回归）

**Given** 某项目既有 pi-tasks 任务又有协作黑板任务
**When** 用户打开项目工作区「任务」页签
**Then** 页签仅显示 pi-tasks 体系任务（Story 9.43 现状），不出现协作黑板任务
**And** 多 Agent 协作窗口的看板不受该页签影响

### AC6: 会话恢复（活跃任务 + 最近终端任务）

**Given** 协作会话已产生任务历史，用户关闭协作窗口后重新打开同一项目
**When** 协作窗口加载完成
**Then** 看板通过快照恢复该会话的活跃任务与各 Agent 最近终端任务
**And** 全量历史任务不保证恢复（已知限制）；后续新任务仍通过事件流实时追加

### AC7: HITL 触发发送系统通知

**Given** 协作会话处于运行状态
**When** Supervisor 或 Worker 发出 `HUMAN_REVIEW_REQUEST`（含 `ask_user_question`、`escalate_to_human`、直连 `HITL_ESCALATE` 三条路径）
**Then** OriginOS 通知中心创建一条 `system_message` 类型通知，标题含发起方名称、正文为问题摘要
**And** 通知创建失败时仅记录 `console.error`，HITL 挂起/恢复流程不受影响
**And** 同一会话同一 HITL 事件不重复创建通知（按 `hitlEventId` 幂等）

---

## 🔍 边界条件

### 正常场景

1. **场景 1: 单任务单 Agent**
   - 输入: 目标只需 1 个 Worker 完成 1 个任务
   - 输出: 看板出现 1 条任务，汇总条活跃 1、完成 0

2. **场景 2: 同一 Agent 串行多任务**
   - 输入: Supervisor 对同一 Worker 先后派发 2 个任务
   - 输出: 看板显示 2 条任务，各自独立状态流转

### 异常场景

1. **异常 1: 快照接口失败**
   - 触发条件: `/snapshot` 返回非 200 或 fetch 异常
   - 错误处理: 记录 `console.error`，看板降级为事件驱动模式
   - 用户提示: 看板正常渲染（可能数据不全），不弹出错误打断协作

2. **异常 2: 会话不存在/未产生任务**
   - 触发条件: Supervisor 尚未分派任何任务（如处于 HITL 等待）
   - 错误处理: 看板显示空态文案「暂无任务，等待 Supervisor 分派」
   - 用户提示: 空态占位，不显示报错

3. **异常 3: HITL 通知创建失败**
   - 触发条件: 通知目录不可写等 IO 异常
   - 错误处理: `console.error` 记录，不抛出
   - 用户提示: 无（HITL 输入框在协作窗口内仍正常出现）

### 边界值

- 最小值: 0 条任务（空态）
- 最大值: 单会话任务数无硬限制；列表超 50 条时看板区域内部滚动
- 默认值: 无会话时看板整体不渲染（保持现有 `topology !== null` 同级 gating 风格）
- 空值处理: `assignedTo` 缺失时显示「未分配」；`description` 缺失时截断显示 `taskId`

---

## 🔗 依赖关系

### 前置依赖

| Story | 依赖内容 | 状态 |
|-------|---------|------|
| Story 9.36 | `AgentTaskSnapshot`、`TASK_*` 事件、`/snapshot` API | ✅ 实施完成（本地 0.4.x） |
| Story 9.37/9.40 | 协作窗口消息流/HITL 基础设施 | 🔄 部分 In Progress（本 Story 仅依赖已上线部分） |
| 拓扑修复（本次会话） | `targetAgentId/target` 别名兼容已合入工作区 | ✅ 已验证 |

### 后续依赖

| Story | 依赖内容 | 影响 |
|-------|---------|------|
| Story 9.40 | 任务看板与消息流布局协同 | 看板为 9.40 的 UI 改造提供既有面板 |
| 未来打通 Story | 协作黑板任务 ↔ pi-tasks 互操作 | 本 Story 明确不承担 |

---

## ⚡ 非功能需求

### 性能要求

根据 AGENTS.md 第 6 章：

- **事件到看板更新:** < 500ms（消息响应同标准）
- **快照拉取:** < 5s（MVP 本体查询同级标准；快照接口有 5s 缓存）
- **并发用户:** ≥ 10（MVP）
- **数据量:** 单会话任务列表内部滚动，>50 条虚拟化或截断提示

### 安全要求

- **认证:** 沿用现有协作 API 边界，无新增鉴权面
- **授权:** 看板为只读，不引入新写入路径
- **数据加密:** 无敏感数据新增（任务描述为会话内数据）

### 可用性要求

- **可访问性:** 任务条目可键盘聚焦（Tab），状态色不只靠颜色区分（附文字标签）
- **浏览器兼容:** Chrome, Edge, Firefox 最新 2 个版本；Electron 内置 Chromium
- **响应式:** 看板在协作窗口 50% 右栏内自适应；窄窗口下左栏收窄（沿用现有宽度联动逻辑）

### 可维护性要求

- **代码规范:** 符合 AGENTS.md 和 ESLint 规则（禁止 any、禁止内联样式）
- **文档完整性:** 新增组件与函数有 JSDoc/中文注释
- **测试覆盖率:** 核心派生/归并逻辑 ≥ 80%

---

## 📝 需求变更历史

| 日期 | 变更内容 | 变更原因 | 变更人 |
|------|---------|---------|--------|
| 2026-10-12 | 初始版本 | 用户提出 Multica 式统一任务看板需求 | Claude Code |
| 2026-10-12 | FR4 收窄为非全量恢复；新增 FR6（HITL 系统通知）与 AC7 | 用户决策 | Claude Code |

---

## 🔍 需求审查

### 审查清单

- [x] 需求来源明确
- [x] 验收标准清晰可测试
- [x] 依赖关系已识别
- [x] 边界条件已定义
- [x] 非功能需求已考虑
- [ ] 与 PRD 一致（PRD 未覆盖 Multica 看板，属 Epic 9 Phase 3 增量，已在本 Story 声明来源）
- [x] 与 Epic 对齐

### 审查记录

| 日期 | 审查人 | 结果 | 备注 |
|------|--------|------|------|
| 2026-10-12 | TBD | 🔄 Needs Revision | 待用户评审 |

---

## 📌 相关文档

- [Story README](./README.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [PRD](../../../_bmad-output/planning-artifacts/prd.md)
- [Epic 9](../../../_bmad-output/planning-artifacts/epics.md#epic-9)
