# 测试策略 - Story 9.32

**Story:** Worker 结构化阻塞契约（report_block）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### 测试层级

| 层级 | 覆盖范围 | 优先级 |
|------|---------|--------|
| **单元测试** | WorkerBlock 类型、report_block 工具、schema 验证 | 必须 |
| **集成测试** | 事件路由、BLOCKED 状态管理 | 必须 |
| **实证测试** | 端到端阻塞流程 | 必须 |

---

## 测试用例

### 单元测试

#### 测试 1：4 种 block 类型验证
- **测试内容**：构造 4 种 WorkerBlock 类型
- **预期结果**：zod schema 验证通过
  - need_input：含 missingFields、rationale
  - decision_required：含 options、rationale
  - conflict_detected：含 conflictWith、conflictField、details
  - capability_missing：含 missing、suggestedAgent（可选）

#### 测试 2：非法 block 输入
- **测试内容**：传入非法 block（缺 type 字段）
- **预期结果**：schema 校验失败，返回错误，Worker 重试

#### 测试 3：report_block 工具调用
- **测试内容**：Worker 调用 report_block 工具
- **预期结果**：
  - Worker 进程进入 BLOCKED 状态
  - 挂起但不销毁（保留消息历史）

#### 测试 4：WORKER_BLOCK 事件生成
- **测试内容**：report_block 调用后
- **预期结果**：
  - 运行时发出 WORKER_BLOCK 事件
  - 事件 append 到 events.jsonl
  - 事件 payload 含完整 block 对象

---

### 集成测试

#### 测试 5：事件路由到 Supervisor
- **测试内容**：WORKER_BLOCK 事件生成后
- **预期结果**：
  - System 模式：事件路由到常驻 Supervisor
  - Workflow 模式：9.35 之前 fallback failed

#### 测试 6：blockedDispatches map 管理
- **测试内容**：Worker BLOCKED 后
- **预期结果**：
  - Worker dispatchId 加入 blockedDispatches map
  - 待 Supervisor dispatch_worker 触发 resume

#### 测试 7：Worker resume
- **测试内容**：Supervisor 调用 dispatch_worker(workerId, ..., 补充参数)
- **预期结果**：
  - Worker 从 BLOCKED 状态恢复
  - resume 原始消息历史

---

### 实证测试

#### 实证 1：故意缺参 Worker
- **前置条件**：构造一个故意缺参的 Worker
- **操作步骤**：执行 Worker
- **预期结果**：
  - 产生 WORKER_BLOCK 事件
  - 事件 payload 含完整 block 对象

#### 实证 2：Schema 校验失败
- **前置条件**：Worker 尝试传入非法 block
- **操作步骤**：调用 report_block（缺 type 字段）
- **预期结果**：
  - 工具返回错误
  - Worker 重试

#### 实证 3：Worker BLOCKED 状态恢复
- **前置条件**：Worker 进入 BLOCKED 状态
- **操作步骤**：Supervisor 调用 dispatch_worker 重新激活
- **预期结果**：
  - Worker 恢复执行
  - resume 原始消息历史

---

## 验收标准测试

### 验收标准 1：WORKER_BLOCK 事件生成
- **测试方法**：实证 1
- **通过条件**：事件 payload 含完整 block 对象

### 验收标准 2：Schema 校验
- **测试方法**：实证 2
- **通过条件**：非法 block 返回错误，Worker 重试

### 验收标准 3：Worker BLOCKED 状态恢复
- **测试方法**：实证 3
- **通过条件**：Worker 恢复执行，resume 原始消息历史

### 验收标准 4：单测覆盖
- **测试方法**：测试 1-4
- **通过条件**：4 种 block 类型 + 1 种非法输入

---

## 测试场景

### 场景 1：Worker 缺参阻塞
1. Worker 执行任务时遇到缺参
2. Worker 调用 report_block({type: 'need_input', missingFields: ['命名规则'], rationale: '...'})
3. Worker 进入 BLOCKED 状态
4. 运行时发出 WORKER_BLOCK 事件
5. 事件路由到 Supervisor

### 场景 2：Worker 决策点阻塞
1. Worker 执行任务时遇到决策点
2. Worker 调用 report_block({type: 'decision_required', options: [...], rationale: '...'})
3. Worker 进入 BLOCKED 状态
4. 运行时发出 WORKER_BLOCK 事件
5. 事件路由到 Supervisor

### 场景 3：Schema 校验失败
1. Worker 尝试调用 report_block（缺 type 字段）
2. zod schema 验证失败
3. 工具返回错误
4. Worker 基于错误提示重试

### 场景 4：Worker resume
1. Worker 处于 BLOCKED 状态
2. Supervisor 调用 dispatch_worker(workerId, ..., 补充参数)
3. Worker 从 BLOCKED 状态恢复
4. Worker resume 原始消息历史
5. Worker 继续执行任务

### 场景 5：向后兼容
1. 加载历史 events.jsonl（含 HUMAN_REVIEW_REQUEST）
2. 9.31 包装路径将 HUMAN_REVIEW_REQUEST → WORKER_BLOCK{need_input}
3. UI 渲染为 deprecated 样式（灰色 + "legacy"标签）
