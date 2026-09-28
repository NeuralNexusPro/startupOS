# 需求规格 - Story 9.31

**Story:** 单前台 Agent 契约（Supervisor as Sole Foreground Agent）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 用户故事

> 作为协作运行时的设计者，我希望从工程上彻底切断 Worker → User 的直连通路：Worker 工具白名单移除 `ask_user_question`，运行时拒绝 Worker `HUMAN_REVIEW_REQUEST` 直接到达用户层，UI 前台对话窗口仅显示 Supervisor。这样产品层"单前台 Agent"原则才有强约束保障。

---

## 功能需求

### A. 工具白名单收紧（必须）

- [ ] `agent-worker.mts` Worker 模式启动时**不再注册** `ask_user_question` 工具
- [ ] `role-agent-creator` / `agent-creator` skill 输出的默认 `Tool.md` 模板移除 `ask_user_question`
- [ ] `agent-manager.ts` 工具按 scope 过滤逻辑：`scope: 'worker'` 时强制剔除 `ask_user_question`
- [ ] 单测：Worker 子进程无法成功调用 `ask_user_question`（运行时返回错误"Worker is not allowed to ask user directly"）

### B. 运行时事件路由收敛（必须）

- [ ] `multi-agent-executor.ts` / `event-mapper.ts`：检测来自 Worker 子进程的 `HUMAN_REVIEW_REQUEST` 事件 → 自动包装为 `WORKER_BLOCK{type:'need_input', missingFields:[], rationale: <原文本>, suggestedQuestion: <原文本>}`，并路由到当前 Supervisor（不再向 SSE 用户层发送）
- [ ] 当前会话不存在 Supervisor 时（Workflow 模式 + 9.35 未实现前），运行时记录 warning 并把事件转为 `failed`，**不**让用户层收到 Worker 原句
- [ ] 单测：Worker 抛 `HUMAN_REVIEW_REQUEST` → 用户层 SSE 事件流不出现 worker 原文

### C. UI 前台对话收敛（必须）

- [ ] 协作会话视图：前台对话窗口只渲染 `from === 'supervisor'` 的消息
- [ ] Worker 内部活动以可折叠"内部活动"区域呈现（与前台主对话分离）
- [ ] 旧数据兼容：`from === 'worker'` 且类型为 `HUMAN_REVIEW_REQUEST` 的历史事件自动归类到内部区域

### D. 接口约束（必须）

- [ ] `POST /api/collaboration/sessions/[id]/messages`：消息体新增隐式字段 `to: 'supervisor'`，移除 `to: workerId` 的代码分支
- [ ] 协作会话期间用户消息 schema 校验拒绝 `to !== 'supervisor'`

---

## 验收标准

1. - [ ] `proj-1778321075425-gmv0zt4h8` 实证：协作会话期间 SSE 流给前端的所有 user-facing 消息 `from` 字段全部为 `supervisor`
2. - [ ] grep `ask_user_question` 在 worker 注册路径下无结果
3. - [ ] 单元测试覆盖：Worker → ask_user_question 拒绝；Worker → HUMAN_REVIEW_REQUEST 包装；用户消息 to !== supervisor 拒绝
4. - [ ] `npx tsc --noEmit --skipLibCheck` 0 error

---

## 边界条件

### 不在范围

- ❌ Worker 结构化阻塞契约（`report_block`）：见 9.32
- ❌ Supervisor 决策路径：见 9.33
- ❌ Workflow 模式 Lightweight Supervisor：见 9.35

---

## 依赖关系

- **依赖**: 9.30 PR-A（Supervisor 子进程化）
- **被依赖**: 9.32（Worker 结构化阻塞契约）依赖本 Story

---

## 范围

### 关键文件

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| MODIFY | `src/modules/collaboration-runtime/sandbox/agent-worker.mts` | Worker 模式工具注册移除 `ask_user_question` |
| MODIFY | `src/lib/integrations/pi-agent/agent-manager.ts` | scope 过滤强制剔除 |
| MODIFY | `src/lib/collaboration-runtime-bridge/event-mapper.ts` | `HUMAN_REVIEW_REQUEST` → `WORKER_BLOCK` 包装 |
| MODIFY | `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` | 事件路由强制经过 Supervisor |
| MODIFY | `src/app/api/collaboration/sessions/[id]/messages/route.ts` | `to: supervisor` 强约束 |
| MODIFY | UI 协作查看器组件 | 前台/内部活动两层渲染 |
