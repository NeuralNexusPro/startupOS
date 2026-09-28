# 测试策略 - Story 9.30

**Story:** Supervisor Agent 化（Supervisor as Real Agent）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### 测试层级

| 层级 | 覆盖范围 | 优先级 |
|------|---------|--------|
| **实证级（端到端）** | 完整协作会话流程 | 必须 |
| **单元/集成级** | 工具注册、prompt 构建、状态机 | 必须 |
| **回归测试** | 现有 API route 测试 | 必须 |

---

## 测试用例

### 实证级测试（端到端，必须）

#### 实证 1：Supervisor 子进程启动
- **前置条件**：协作会话启动
- **操作步骤**：启动 Supervisor Agent 模式
- **预期结果**：supervisor agent 子进程在 `ps` 中可见

#### 实证 2：事件流可观测
- **前置条件**：Supervisor 子进程已启动
- **操作步骤**：执行完整协调流程
- **预期结果**：`events.jsonl` 中可观测 `SUPERVISOR_AGENT_START` / `SUPERVISOR_DECOMPOSITION` / `SUPERVISOR_DISPATCH` / `SUPERVISOR_AGGREGATE`

#### 实证 3：差异化任务派发
- **前置条件**：`proj-1778321075425-gmv0zt4h8` 项目
- **操作步骤**：以 Supervisor Agent 模式运行
- **预期结果**：7 个 worker 各自收到差异化任务 prompt（不再是同源 globalGoal）
  - 例如：naming-reviewer 收到"审查命名规范"，不是"创建项目"

#### 实证 4：旧代码清理验证
- **前置条件**：Supervisor Agent 模式运行
- **操作步骤**：监控全过程 LLM 调用
- **预期结果**：不再调用已删除的 `rewriteSubTaskGoal`

#### 实证 5：最终报告产出
- **前置条件**：完整协调流程完成
- **操作步骤**：检查会话目录
- **预期结果**：`finalReport.md` 在会话目录产出

#### 实证 6：M1 范围 HITL（如实施 PR-B）
- **前置条件**：Worker 抛出 HITL
- **操作步骤**：Supervisor 接收 HITL 事件
- **预期结果**：Supervisor 能选择短路（`dispatch_worker` 补参）或升级用户（`escalate_to_human`）

---

### 单元/集成级测试

#### 单元 7：Supervisor System Prompt 完整性
- **测试内容**：验证 supervisor system prompt 7 层结构
- **预期结果**：
  - Identity 来自 `Agent.md`
  - Layer 6 含协作上下文（globalGoal、topology、agentCards、sessionDir）

#### 单元 8：dispatch_worker 工具调用
- **测试内容**：调用 `dispatch_worker` 工具
- **预期结果**：
  - spawn worker 子进程
  - worker 任务 prompt 仅含三段（与 9.29 SUP-10 验证一致）

#### 单元 9：wait_workers 阻塞行为
- **测试内容**：调用 `wait_workers(dispatchIds, timeoutMs)`
- **预期结果**：在所有 dispatch 完成前正确阻塞 `supervisor.prompt`

#### 单元 10：工具白名单验证
- **测试内容**：Supervisor 尝试调用禁止工具
- **预期结果**：尝试调用 `write_file` 被沙箱拒绝

#### 单元 11：TypeScript 编译
- **测试命令**：`npx tsc --noEmit --skipLibCheck`
- **预期结果**：0 error

#### 单元 12：ESLint 检查
- **测试命令**：`npm run lint`
- **预期结果**：0 Error（针对本 Story 改动文件）

---

## 验收标准测试

### 验收标准 1：Supervisor 子进程可见
- **测试方法**：实证 1
- **通过条件**：`ps` 命令可见 supervisor agent 子进程

### 验收标准 2：事件流完整
- **测试方法**：实证 2
- **通过条件**：`events.jsonl` 包含所有必需事件类型

### 验收标准 3：任务差异化
- **测试方法**：实证 3
- **通过条件**：7 个 worker 的任务 prompt 显著不同

### 验收标准 4：旧代码清理
- **测试方法**：实证 4
- **通过条件**：无 `rewriteSubTaskGoal` 调用

### 验收标准 5：最终报告
- **测试方法**：实证 5
- **通过条件**：`finalReport.md` 文件存在且内容完整

### 验收标准 6：HITL 决策（M1）
- **测试方法**：实证 6
- **通过条件**：Supervisor 能正确选择短路或升级

### 验收标准 7-12：单元/集成测试
- **测试方法**：单元 7-12
- **通过条件**：所有单元测试通过

---

## 测试场景

### 场景 1：完整协调流程
1. 启动协作会话
2. Supervisor 进入 `decomposing` 状态
3. Supervisor 产出 SubTask 列表（含 7 个 worker）
4. Supervisor 进入 `dispatching` 状态，派发任务
5. Worker 执行任务，产出 artifact
6. Supervisor 进入 `monitoring` 状态
7. Supervisor 进入 `verifying` 状态
8. Supervisor 进入 `aggregating` 状态
9. Supervisor 写入 `finalReport.md`
10. 关闭所有子进程

### 场景 2：Worker 阻塞与补参
1. Worker 抛出 `WORKER_BLOCK{need_input}`
2. Supervisor 接收事件
3. Supervisor 调用 `bb_get_artifact` 获取信息
4. Supervisor 调用 `dispatch_worker(workerId, ..., 补充参数)` 重新激活 Worker
5. Worker 继续执行

### 场景 3：HITL 升级（M1）
1. Worker 抛出 `WORKER_BLOCK{need_input}`
2. Supervisor 无法自助补参
3. Supervisor 调用 `escalate_to_human(question, mergedContext)`
4. 用户收到问题
5. 用户回复
6. Supervisor 接收回复，继续协调

### 场景 4：工具白名单验证
1. Supervisor 尝试调用 `write_file`
2. 沙箱拒绝调用
3. Supervisor 收到错误提示
4. Supervisor 调整策略

### 场景 5：等待 Worker 完成
1. Supervisor 调用 `wait_workers(dispatchIds, timeoutMs)`
2. Worker 未完成时，`supervisor.prompt` 阻塞
3. Worker 完成后，`wait_workers` 返回
4. Supervisor 继续下一步
