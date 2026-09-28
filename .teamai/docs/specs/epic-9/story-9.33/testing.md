# 测试策略 - Story 9.33

**Story:** Supervisor HITL 决策器
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### 测试层级

| 层级 | 覆盖范围 | 优先级 |
|------|---------|--------|
| **单元测试** | 四种决策路径、schema 验证、防滥用计数 | 必须 |
| **集成测试** | 决策日志、事件路由 | 必须 |
| **实证测试** | 端到端决策流程 | 必须 |

---

## 测试用例

### 单元测试

#### 测试 1：自助补参路径
- **测试内容**：Supervisor 收到 need_input block，通过 bb_get_artifact 获取信息
- **预期结果**：Supervisor 调用 dispatch_worker 补参重派，无需升级用户

#### 测试 2：改派路径
- **测试内容**：Supervisor 判断信息归属其他 Worker
- **预期结果**：Supervisor 改派给其他 Worker

#### 测试 3：升级用户路径
- **测试内容**：Supervisor 无法自助解决
- **预期结果**：Supervisor 调用 escalate_to_human，含 mergedContext

#### 测试 4：拒绝路径
- **测试内容**：Supervisor 无法处理
- **预期结果**：Supervisor 标记任务 failed

#### 测试 5：escalate_to_human schema 验证
- **测试内容**：缺失 mergedContext 字段
- **预期结果**：schema 校验失败

#### 测试 6：防滥用约束
- **测试内容**：同一 (workerId, block.type) 连续 4 次升级
- **预期结果**：第 4 次被拒绝，返回 "max_escalations_reached, must change strategy"

---

### 集成测试

#### 测试 7：决策日志写入
- **测试内容**：Supervisor 做出决策
- **预期结果**：decisions.jsonl 追加一行，含 ts/blockId/blockType/decision/rationale

#### 测试 8：SUPERVISOR_DECIDE 事件
- **测试内容**：Supervisor 做出决策
- **预期结果**：events.jsonl 写入 SUPERVISOR_DECIDE 事件

#### 测试 9：决策延迟告警
- **测试内容**：单 Block 决策延迟超过 60s
- **预期结果**：运行时记录告警，事件流标记 SUPERVISOR_STALL

---

### 实证测试

#### 实证 1：自助补参
- **前置条件**：`proj-1778321075425-gmv0zt4h8` 项目
- **操作步骤**：naming-reviewer 抛 need_input{missingFields:['命名规则']}
- **预期结果**：Supervisor 通过 bb_get_artifact 拿到 design-data-import 的产出，自助补参重派

#### 实证 2：防滥用约束
- **前置条件**：Supervisor 连续 3 次升级同一 block 类型
- **操作步骤**：第 4 次尝试升级
- **预期结果**：第 4 次被拒绝

#### 实证 3：schema 校验
- **前置条件**：Supervisor 调用 escalate_to_human
- **操作步骤**：缺失 mergedContext
- **预期结果**：schema 校验失败

#### 实证 4：决策日志完整性
- **前置条件**：完整决策流程
- **操作步骤**：检查 decisions.jsonl
- **预期结果**：含完整决策轨迹

---

## 验收标准测试

### 验收标准 1：自助补参
- **测试方法**：实证 1
- **通过条件**：Supervisor 自助补参重派，无需升级用户

### 验收标准 2：防滥用约束
- **测试方法**：实证 2
- **通过条件**：第 4 次被拒绝

### 验收标准 3：schema 校验
- **测试方法**：实证 3
- **通过条件**：缺失 mergedContext 校验失败

### 验收标准 4：决策日志
- **测试方法**：实证 4
- **通过条件**：decisions.jsonl 含完整决策轨迹

### 验收标准 5：单测覆盖
- **测试方法**：测试 1-6
- **通过条件**：四种决策路径覆盖

---

## 测试场景

### 场景 1：自助补参
1. Worker 抛出 need_input block
2. Supervisor 收到 WORKER_BLOCK 事件
3. Supervisor 进入 block_received 状态
4. Supervisor 尝试 bb_get_artifact
5. 获取到信息
6. Supervisor 调用 dispatch_worker 补参重派
7. Worker resume 执行

### 场景 2：升级用户
1. Worker 抛出 need_input block
2. Supervisor 收到 WORKER_BLOCK 事件
3. Supervisor 尝试自助失败
4. Supervisor 调用 escalate_to_human(question, mergedContext)
5. 用户收到问题，显式标注"代 {onBehalfOf} 询问"
6. 用户回复
7. Supervisor 接收回复，继续协调

### 场景 3：防滥用约束
1. Worker 连续抛出相同类型 block
2. Supervisor 连续 3 次升级用户
3. 第 4 次尝试升级
4. 运行时拒绝，返回 "max_escalations_reached, must change strategy"
5. Supervisor 被迫切换决策

### 场景 4：决策延迟告警
1. Supervisor 收到 WORKER_BLOCK 事件
2. Supervisor 长时间未做出决策（> 60s）
3. 运行时记录告警
4. 事件流标记 SUPERVISOR_STALL
