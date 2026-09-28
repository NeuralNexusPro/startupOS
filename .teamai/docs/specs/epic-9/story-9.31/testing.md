# 测试策略 - Story 9.31

**Story:** 单前台 Agent 契约（Supervisor as Sole Foreground Agent）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### 测试层级

| 层级 | 覆盖范围 | 优先级 |
|------|---------|--------|
| **单元测试** | 工具白名单、事件路由、schema 校验 | 必须 |
| **集成测试** | API 路由、UI 渲染 | 必须 |
| **实证测试** | 端到端协作会话 | 必须 |

---

## 测试用例

### 单元测试

#### 测试 1：Worker 无法调用 ask_user_question
- **测试内容**：Worker 子进程尝试调用 `ask_user_question`
- **预期结果**：运行时返回错误"Worker is not allowed to ask user directly"

#### 测试 2：Worker HUMAN_REVIEW_REQUEST 自动包装
- **测试内容**：Worker 抛出 `HUMAN_REVIEW_REQUEST` 事件
- **预期结果**：
  - 事件自动包装为 `WORKER_BLOCK{type:'need_input', missingFields:[], rationale: <原文本>}`
  - 路由到 Supervisor
  - 用户层 SSE 事件流不出现 worker 原文

#### 测试 3：用户消息 to !== supervisor 拒绝
- **测试内容**：用户发送消息 `to: 'worker-1'`
- **预期结果**：schema 校验失败，返回错误

#### 测试 4：TypeScript 编译
- **测试命令**：`npx tsc --noEmit --skipLibCheck`
- **预期结果**：0 error

---

### 集成测试

#### 测试 5：API 路由强制 to: supervisor
- **测试内容**：POST /api/collaboration/sessions/[id]/messages
- **预期结果**：
  - 消息体 `to: 'supervisor'` 通过
  - 消息体 `to: 'worker-1'` 被拒绝

#### 测试 6：UI 前台对话收敛
- **测试内容**：协作会话视图渲染
- **预期结果**：
  - 前台对话窗口仅显示 `from === 'supervisor'` 的消息
  - Worker 活动显示在可折叠"内部活动"区域

#### 测试 7：旧数据兼容
- **测试内容**：加载历史 events.jsonl（含 `from === 'worker'` 的 `HUMAN_REVIEW_REQUEST`）
- **预期结果**：历史事件自动归类到"内部活动"区域

---

### 实证测试

#### 实证 1：SSE 流消息 from 字段
- **前置条件**：`proj-1778321075425-gmv0zt4h8` 项目
- **操作步骤**：启动协作会话，执行完整流程
- **预期结果**：SSE 流给前端的所有 user-facing 消息 `from` 字段全部为 `supervisor`

#### 实证 2：grep ask_user_question
- **测试命令**：`grep -r "ask_user_question" src/modules/collaboration-runtime/sandbox/`
- **预期结果**：Worker 注册路径下无结果

---

## 验收标准测试

### 验收标准 1：SSE 流消息 from 字段
- **测试方法**：实证 1
- **通过条件**：所有 user-facing 消息 `from === 'supervisor'`

### 验收标准 2：grep ask_user_question
- **测试方法**：实证 2
- **通过条件**：Worker 注册路径下无 `ask_user_question`

### 验收标准 3：单元测试覆盖
- **测试方法**：测试 1-4
- **通过条件**：
  - Worker → ask_user_question 拒绝
  - Worker → HUMAN_REVIEW_REQUEST 包装
  - 用户消息 to !== supervisor 拒绝

### 验收标准 4：TypeScript 编译
- **测试方法**：测试 4
- **通过条件**：0 error

---

## 测试场景

### 场景 1：Worker 尝试直接询问用户
1. Worker 执行任务时遇到缺参
2. Worker 尝试调用 `ask_user_question`
3. 运行时拒绝调用
4. Worker 收到错误提示
5. Worker 改用 `report_block` 上报阻塞

### 场景 2：Worker 抛出 HUMAN_REVIEW_REQUEST
1. Worker 抛出 `HUMAN_REVIEW_REQUEST` 事件
2. event-mapper.ts 检测到事件
3. 自动包装为 `WORKER_BLOCK{type:'need_input'}`
4. 路由到 Supervisor
5. 用户层 SSE 事件流不出现 worker 原文

### 场景 3：用户发送消息
1. 用户在前台对话窗口输入消息
2. 消息体 `to: 'supervisor'`
3. API 路由接收消息
4. schema 校验通过
5. 消息附加到 Supervisor 消息历史

### 场景 4：用户误操作 to: workerId
1. 用户尝试发送消息 `to: 'worker-1'`
2. API 路由接收消息
3. schema 校验失败
4. 返回错误"User messages must be directed to supervisor"

### 场景 5：UI 渲染协作会话
1. 加载协作会话 events.jsonl
2. 前台对话窗口渲染 `from === 'supervisor'` 的消息
3. Worker 活动显示在可折叠"内部活动"区域
4. 用户仅与 Supervisor 对话

### 场景 6：旧数据兼容
1. 加载历史 events.jsonl（含 `from === 'worker'` 的 `HUMAN_REVIEW_REQUEST`）
2. UI 检测到历史事件
3. 自动归类到"内部活动"区域
4. 前台对话窗口不受影响
