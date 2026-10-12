# Story Spec: 9.44 - 多Agent协作统一任务看板（Multica模式）

**Epic:** 9 - 多 Agent 协作运行时
**Status:** 🟡 Planning
**Owner:** Archersado
**Created:** 2026-10-12
**Last Updated:** 2026-10-12

---

## 📋 Story 概览

### User Story

作为使用多 Agent 协作的用户，
我想在发起协作目标后，通过一个统一的任务管理看板看到 Supervisor 把任务分派给了哪个 Agent、每个任务当前处于什么状态和进度，
以便我能像使用 Multica 一样掌握整个协作过程，而不需要在聊天流里逐条翻找分派记录。

### 背景与动机

- 多 Agent 协作运行时已具备 Multica 式的内核能力：Supervisor 通过 `dispatch_worker` 在黑板创建任务并派发给 Worker（`TASK_CREATED / TASK_ASSIGNED / TASK_STARTED` 事件），任务状态经 `TASK_REPORTED / TASK_COMPLETED` 流转，且已有 `AgentTaskSnapshot` 快照机制与只读 API `GET /api/collaboration/sessions/[id]/snapshot`（Story 9.36）。
- 但上述任务数据目前没有任何 UI 消费：协作窗口（`MultiAgentLauncher`）仅呈现聊天流与拓扑图，任务看板是"有引擎、无界面"的状态。
- 本 Story 将补齐这一界面，使「用户发起任务 → Supervisor 按协作拓扑分派 → 统一看板呈现 Agent-任务映射与进度」的 Multica 模式闭环可见。

### 范围声明（重要）

- **看板只出现在「多 Agent 协作」窗口**（`CollaborationWindow` / `MultiAgentLauncher`）。
- **原项目工作区（ProjectWorkspace）的「任务」页签不需要呈现协作运行时任务**：该页签的 `ProjectTaskBoard`（Story 9.43，pi-tasks 体系）保持现状；本 Story 不做协作黑板任务与 pi-tasks 两套体系的打通或互串。
- 看板为只读呈现，不提供任务级人工干预操作（暂停/重试/取消等）；人工介入仍通过 Supervisor 聊天/HITL 通道进行。
- **会话恢复不做全量任务快照**（用户决策 2026-10-12）：恢复仅消费现有 `WorkspaceTaskSnapshot` 形态（活跃任务 + 各 Agent 最近终端任务）；全量历史恢复为后续项，不新增字段、不改用 blackboard GET。
- **HITL 暂停时向 OriginOS 发送系统通知**（用户决策 2026-10-12）：Supervisor/Worker 发起 `HUMAN_REVIEW_REQUEST` 时，在 OriginOS 通知中心创建一条系统通知（复用现有 `NotificationManager`），让用户在其他窗口也能感知协作等待。

### 验收标准（简要）

- [ ] AC1: 用户在协作窗口发送目标后，Supervisor 分派任务时看板实时出现任务条目（描述、负责 Agent、状态），无需刷新
- [ ] AC2: 任务状态随 `TASK_*` 事件流转在看板实时更新（created→assigned→running→reported→completed/failed）
- [ ] AC3: 看板提供汇总统计（活跃/已完成/失败数），并支持点击任务定位到对应 Agent 的详情抽屉
- [ ] AC4: Electron（IPC）与 Web（HTTP）双通道均可获取任务快照；快照不可用时看板降级为事件驱动数据，不白屏
- [ ] AC5: 项目工作区「任务」页签不出现协作运行时任务（回归确认，两套体系未打通）
- [ ] AC6: 协作窗口重开后，看板通过快照恢复活跃任务与各 Agent 最近终端任务（全量历史恢复暂不支持，记为已知限制）
- [ ] AC7: HITL 触发时（`HUMAN_REVIEW_REQUEST`），OriginOS 通知中心出现一条系统通知（未读计数 +1）；通知创建失败不影响 HITL 流程

---

## 👥 团队

| 角色 | 姓名 | 职责 |
|------|------|------|
| Product Owner | Archersado | 需求定义和验收 |
| Tech Lead | Archersado | 架构设计 |
| Developer | Claude Code | 开发实施 |
| QA | Archersado | 测试验证 |

---

## 📅 时间线

| 阶段 | 开始日期 | 结束日期 | 状态 |
|------|---------|---------|------|
| 需求分析 | 2026-10-12 | 2026-10-12 | ✅ Done |
| 交互设计 | 2026-10-12 | 2026-10-12 | ✅ Done |
| 架构设计 | 2026-10-12 | 2026-10-12 | ✅ Done |
| 开发实施 | TBD | TBD | ⏳ Pending |
| 测试验证 | TBD | TBD | ⏳ Pending |
| 上线部署 | TBD | TBD | ⏳ Pending |

---

## 🔗 相关链接

### 规划文档
- [PRD](../../../_bmad-output/planning-artifacts/prd.md)
- [Epic 9](../../../_bmad-output/planning-artifacts/epics.md#epic-9)
- [Architecture](../../../_bmad-output/planning-artifacts/architecture.md)
- [UX Design](../../../_bmad-output/planning-artifacts/ux-design-specification.md)

### 规约文档
- [AGENTS.md](../../../AGENTS.md)

### Story 文档
- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [开发文档](./implementation.md)
- [测试文档](./testing.md)

### 关联 Story
- Story 9.36（Supervisor/Worker 模式架构改进）：提供 `AgentTaskSnapshot` 快照机制与 `/snapshot` API
- Story 9.40（协作 UI：多 HITL 并发与消息流对齐）：协作窗口消息流基础设施
- Story 9.43（项目任务看板与协同图联动）：pi-tasks 看板，位于项目工作区，与本 Story 明确不打通

---

## 📊 进度跟踪

### 当前状态

🟢 **Approved** - 文档已评审，Proposal add-collaboration-task-board 已获批（2026-10-12），待实施

### 完成情况

- [x] 需求文档完成
- [x] 交互设计完成
- [x] 架构设计完成
- [ ] 开发实施完成
- [ ] 测试验证完成
- [ ] 文档审查完成

### 阻塞问题

_当前无阻塞问题_

---

## 📝 变更历史

| 日期 | 变更内容 | 变更人 |
|------|---------|--------|
| 2026-10-12 | 初始化 Story Spec，完成 6 份文档初稿 | Claude Code |
| 2026-10-12 | 用户决策：暂不做全量任务快照恢复（AC6 收窄）；新增 AC7——HITL 触发时向 OriginOS 通知中心发送系统通知 | Claude Code |

---

## 📌 快速导航

- [⬆️ 返回 Epic 概览](../README.md)
- [📋 需求文档](./requirements.md)
- [🎨 交互设计](./interaction.md)
- [🏗️ 架构设计](./architecture.md)
- [💻 开发文档](./implementation.md)
- [🧪 测试文档](./testing.md)
