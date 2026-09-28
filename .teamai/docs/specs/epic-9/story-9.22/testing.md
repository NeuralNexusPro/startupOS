# 测试策略 - Story 9.22

**Story:** 三层模型路由
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 测试策略

### 单元测试

- 测试 `ModelRouter` 类的核心方法：`route`、`evaluateComplexity`、`checkAvailability`、`fallback`
- 测试复杂度评估算法：token 量、操作类型、依赖深度、安全敏感度权重
- 测试 Agent 类型默认映射：architect→opus、coder→sonnet 等
- 测试回退机制：模型过载时降级到下一 Tier
- 测试 Agent Booster：简单转换（var→const、加类型、格式化）成本 $0，延迟 <1ms

### 集成测试

- 测试模型路由器与 Pi Agent 的集成
- 测试端到端路由决策流程

---

## 测试用例

### 用例 1：低复杂度任务路由到 Haiku

**前置条件**：任务复杂度 <30%

**操作步骤**：
1. 调用 `router.route('coder', '简单格式化任务')`

**预期结果**：
- 返回 `haiku`
- 单次成本 < $0.001

---

### 用例 2：高复杂度任务路由到 Sonnet/Opus

**前置条件**：任务复杂度 >30%

**操作步骤**：
1. 调用 `router.route('architect', '复杂架构设计任务')`

**预期结果**：
- 返回 `opus`（architect 默认）或 `sonnet`（高复杂度）

---

### 用例 3：Agent Booster 处理简单转换

**前置条件**：任务为简单转换（var→const、加类型、去 console）

**操作步骤**：
1. 调用 `router.route('formatter', '将 var 改为 const')`

**预期结果**：
- 返回 `booster`
- 成本 $0，延迟 <1ms

---

### 用例 4：模型过载自动降级

**前置条件**：Haiku 模型过载（`checkAvailability('haiku')` 返回 false）

**操作步骤**：
1. 调用 `router.fallback('haiku')`

**预期结果**：
- 返回 `sonnet`（降级到下一 Tier）

---

### 用例 5：Agent 类型默认映射

**前置条件**：无

**操作步骤**：
1. 调用 `router.route('architect', '任意任务')`
2. 调用 `router.route('coder', '任意任务')`
3. 调用 `router.route('formatter', '任意任务')`

**预期结果**：
- architect → opus
- coder → sonnet
- formatter → haiku

---

### 用例 6：安全敏感度因子

**前置条件**：任务涉及安全敏感操作

**操作步骤**：
1. 调用 `router.route('coder', '处理用户密码的任务')`

**预期结果**：
- 至少使用 Sonnet（即使复杂度低）

---

## 验收标准测试

- [ ] 低复杂度任务（<30%）路由到 Haiku，单次成本 < $0.001
- [ ] 高复杂度任务（>30%）路由到 Sonnet/Opus
- [ ] Agent Booster 处理简单转换（成本 $0，延迟 <1ms）
- [ ] 模型过载时自动降级到下一 Tier
- [ ] Agent 类型默认映射生效
- [ ] 安全敏感度因子使安全相关任务至少使用 Sonnet
