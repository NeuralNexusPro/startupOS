# 测试策略 - Story 9.13

**Story:** Supervisor 模式（Supervisor-Worker）
**Epic:** 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-18

---

## 测试范围

### 单元测试

- SupervisorExecutor 核心逻辑
- 任务分解算法
- Worker 选择与分配
- 失败重分配机制
- 结果汇总逻辑

### 集成测试

- Contract Net 协议完整流程
- CapabilityMatcher 集成
- EventStore 事件写入
- Blackboard 状态同步

### 端到端测试

- 完整 Supervisor-Worker 执行流程
- 多轮迭代场景
- 超时与重试场景

---

## 测试用例

### 核心成功路径

1. **任务分解测试**
   - 输入：全局目标 "分析销售数据并生成报告"
   - 预期：分解为 "数据分析" + "报告生成" 两个子任务
   - 验证：子任务描述清晰，依赖关系正确

2. **Worker 分配测试**
   - 输入：子任务 + 可用 Agent 列表
   - 预期：通过 Contract Net 协议完成分配
   - 验证：cfp → propose → accept → inform 完整流程

3. **失败重分配测试**
   - 输入：Worker 执行失败
   - 预期：重新选择 Worker 并分配
   - 验证：重分配次数不超过 retryCount

4. **结果汇总测试**
   - 输入：多个 Worker 执行结果
   - 预期：生成完整的 SupervisorResult
   - 验证：包含所有 Worker 输出和 Token 消耗统计

### 关键失败路径

1. **分解失败回退**
   - 场景：Supervisor Agent 无法分解任务
   - 预期：返回错误，不创建子任务
   - 验证：错误信息清晰，事件记录完整

2. **全部 Worker 失败**
   - 场景：所有候选 Worker 执行失败
   - 预期：终止执行，返回部分结果
   - 验证：记录失败原因，不无限重试

3. **超时终止**
   - 场景：执行时间超过 timeoutMs
   - 预期：强制终止，返回已完成部分
   - 验证：超时事件写入 EventStore

### 边界条件

1. **空 Agent 列表**
   - 输入：无可用 Worker
   - 预期：返回空结果或错误
   - 验证：不崩溃，错误处理完善

2. **循环依赖检测**
   - 输入：子任务间存在循环依赖
   - 预期：检测并报错
   - 验证：不进入死锁

3. **最大迭代次数**
   - 输入：达到 maxIterations
   - 预期：停止迭代，返回当前结果
   - 验证：迭代计数准确

---

## 验收标准测试

### 自动化验证脚本

```bash
# 运行 Supervisor 模式相关测试
npm test -- supervisor-executor
npm test -- contract-net
npm test -- capability-matcher

# 类型检查
npx tsc --noEmit --skipLibCheck

# Lint 检查
npm run lint
```

### 验收检查清单

- [ ] 所有单元测试通过
- [ ] 集成测试覆盖核心流程
- [ ] E2E 测试验证完整场景
- [ ] 代码覆盖率 ≥ 80%
- [ ] 无 TypeScript 类型错误
- [ ] 无 ESLint 错误
- [ ] 性能指标达标（任务分解 < 1s）

---

## 测试数据

### Mock Agent

```typescript
const mockAgents = [
  {
    id: 'data-analyst',
    capabilities: ['data-analysis', 'statistics'],
    domain: 'analytics',
    currentLoad: 0
  },
  {
    id: 'report-writer',
    capabilities: ['report-generation', 'writing'],
    domain: 'documentation',
    currentLoad: 1
  }
];
```

### Mock 任务

```typescript
const mockGlobalGoal = "分析 Q3 销售数据并生成总结报告";

const expectedSubTasks = [
  {
    id: 'task-1',
    description: '分析 Q3 销售数据',
    requiredCapabilities: ['data-analysis'],
    dependencies: []
  },
  {
    id: 'task-2',
    description: '生成总结报告',
    requiredCapabilities: ['report-generation'],
    dependencies: ['task-1']
  }
];
```

---

## 测试工具

- **单元测试框架**: Jest / Vitest
- **集成测试**: Jest + Testing Library
- **E2E 测试**: Playwright（如需要）
- **覆盖率工具**: Istanbul / c8
- **Mock 工具**: Jest Mock / MSW

---

## 测试执行频率

- **开发阶段**: 每次提交前运行单元测试
- **PR 阶段**: 运行完整测试套件
- **发布前**: 全量测试 + 性能测试
