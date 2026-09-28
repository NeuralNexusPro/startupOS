# 测试策略 - Story OS.13

**Story:** 统一 Agent 记忆使用路径并移除 Dream 主路径
**Epic:** OS — Phase 0 OS 交互基础
**最后更新:** 2026-07-20

---

## 测试目标

验证 Agent 记忆路径重构的正确性和稳定性，确保：

1. Dream 不再作为 OS 层默认长期记忆整理机制
2. Recall 不再被直接注入 system prompt
3. 压缩后仍保留最近完整执行轨迹
4. Memory.md 不再追加 turn 级流水摘要
5. 单 Agent 与多 Agent 使用一致的记忆分层规则
6. 长会话重复 tool loop 明显下降

---

## 测试范围

### 1. Dream 主路径移除测试

#### 测试用例

**TC-1.1: Dream 不再自动调用**

- **输入**：RoleAgent 运行 20 轮以上
- **预期**：Dream 不再被自动调用，Memory.md 不被 Dream 修改
- **验证方式**：日志检查 + 文件监控

**TC-1.2: MemoryTracker 不再追加 turn 摘要**

- **输入**：RoleAgent 运行多轮
- **预期**：Memory.md 不再追加 turn 级流水摘要
- **验证方式**：文件内容检查

**TC-1.3: 长期记忆整理由 memory-core 负责**

- **输入**：Session 结束
- **预期**：history 提交给 memory-core consolidation pipeline
- **验证方式**：日志检查

---

### 2. Recall 注入移除测试

#### 测试用例

**TC-2.1: 单 Agent Recall 不进入 system prompt**

- **输入**：单 Agent 会话，触发 Recall 检索
- **预期**：Recall 结果作为普通补充上下文，不在 system prompt 中
- **验证方式**：system prompt 内容检查

**TC-2.2: 多 Agent Recall 不进入 system prompt**

- **输入**：多 Agent 协作会话，触发 Recall 检索
- **预期**：Recall 结果不在 system prompt 中
- **验证方式**：system prompt 内容检查

**TC-2.3: Supervisor/Worker Recall 不进入 system prompt**

- **输入**：Supervisor 模式会话
- **预期**：Supervisor 和 Worker 的 system prompt 都不包含 Recall
- **验证方式**：system prompt 内容检查

---

### 3. Recent Trace 保护测试

#### 测试用例

**TC-3.1: 压缩保留最近执行轨迹**

- **输入**：长会话触发压缩
- **预期**：最近 user request、assistant 决策、tool call/result 在压缩后仍可见
- **验证方式**：压缩前后消息对比

**TC-3.2: 压缩保留最近失败信息**

- **输入**：会话中包含 tool 失败，触发压缩
- **预期**：最近失败原因在压缩后仍可见
- **验证方式**：压缩前后消息对比

**TC-3.3: 压缩保留禁止重复约束**

- **输入**：会话中包含 supervisor 纠偏，触发压缩
- **预期**：禁止重复约束在压缩后仍可见
- **验证方式**：压缩前后消息对比

**TC-3.4: Recent Trace 优先级高于 Recall**

- **输入**：同时存在 Recent Trace 和 Recall 结果
- **预期**：Recent Trace 被保留，Recall 不被特殊对待
- **验证方式**：压缩策略检查

---

### 4. Memory.md 内容测试

#### 测试用例

**TC-4.1: Memory.md 不包含 turn 摘要**

- **输入**：RoleAgent 运行多轮后检查 Memory.md
- **预期**：Memory.md 不包含 turn 级流水摘要
- **验证方式**：文件内容检查

**TC-4.2: Memory.md 只保留长期稳定认知**

- **输入**：检查 Memory.md 内容
- **预期**：包含偏好、长期约束、稳定事实、已验证工作原则
- **验证方式**：文件内容审查

---

### 5. 单 Agent 与多 Agent 一致性测试

#### 测试用例

**TC-5.1: 单 Agent 记忆分层规则**

- **输入**：单 Agent 会话
- **预期**：system prompt 包含身份、工具、核心记忆、知识/模式快照；messages 包含最近对话 + 执行轨迹
- **验证方式**：上下文结构检查

**TC-5.2: 多 Agent 记忆分层规则**

- **输入**：多 Agent 协作会话
- **预期**：与单 Agent 一致的分层规则
- **验证方式**：上下文结构检查

**TC-5.3: Supervisor 记忆分层规则**

- **输入**：Supervisor 模式会话
- **预期**：与单 Agent 一致的分层规则
- **验证方式**：上下文结构检查

**TC-5.4: Worker 记忆分层规则**

- **输入**：Worker 子进程
- **预期**：与单 Agent 一致的分层规则
- **验证方式**：上下文结构检查

---

### 6. Loop 稳定性测试

#### 测试用例

**TC-6.1: 重复工具失败不陷入 loop**

- **输入**：构造场景：工具连续失败 3 次
- **预期**：Agent 不再反复调用同一工具链
- **验证方式**：长会话回归测试

**TC-6.2: 多 Agent 协作纠偏不陷入 loop**

- **输入**：构造场景：Supervisor 纠偏后 Worker 继续执行
- **预期**：Worker 不再重复被纠偏的动作
- **验证方式**：长会话回归测试

**TC-6.3: Recall 命中旧计划不陷入 loop**

- **输入**：构造场景：Recall 命中旧计划
- **预期**：Agent 不会因 Recall 而重复旧计划
- **验证方式**：长会话回归测试

**TC-6.4: Loop detector 识别重复 tool call**

- **输入**：Agent 连续调用相同工具 3 次
- **预期**：loop detector 识别并输出警告
- **验证方式**：日志检查

---

### 7. 启动链路接入矩阵测试

#### 测试用例

**TC-7.1: Project Launcher 上下文装载**

- **输入**：启动 Project Agent
- **预期**：使用统一的记忆分层规则
- **验证方式**：system prompt 检查

**TC-7.2: Agent Launcher 上下文装载**

- **输入**：启动 Assistant Agent
- **预期**：使用统一的记忆分层规则
- **验证方式**：system prompt 检查

**TC-7.3: Skill Launcher 上下文装载**

- **输入**：启动 Skill Agent
- **预期**：使用统一的记忆分层规则
- **验证方式**：system prompt 检查

**TC-7.4: RoleAgent Launcher 上下文装载**

- **输入**：启动 RoleAgent
- **预期**：使用统一的记忆分层规则
- **验证方式**：system prompt 检查

**TC-7.5: Persistent Agent Manager 上下文装载**

- **输入**：启动 Persistent Project Agent
- **预期**：使用统一的记忆分层规则，从 memory-core 加载长期记忆
- **验证方式**：system prompt 检查

**TC-7.6: Multi-Agent Worker 上下文装载**

- **输入**：启动多 Agent Worker
- **预期**：使用统一的记忆分层规则
- **验证方式**：system prompt 检查

---

### 8. 长会话回归测试

#### 测试用例

**TC-8.1: 长会话压缩后不重复调用工具**

- **输入**：运行 50 轮以上的长会话
- **预期**：压缩后不再反复调用同一工具链
- **验证方式**：会话日志分析

**TC-8.2: 长会话压缩后 Recent Trace 可见**

- **输入**：运行 50 轮以上的长会话
- **预期**：压缩后最近执行轨迹仍然可见
- **验证方式**：消息历史检查

**TC-8.3: 长会话压缩后失败信息可见**

- **输入**：运行包含失败的长会话
- **预期**：压缩后最近失败信息仍然可见
- **验证方式**：消息历史检查

**TC-8.4: 长会话压缩后约束可见**

- **输入**：运行包含纠偏的长会话
- **预期**：压缩后禁止重复约束仍然可见
- **验证方式**：消息历史检查

---

### 9. memory-core 接口边界测试

#### 测试用例

**TC-9.1: OS 层只消费 memory-core**

- **输入**：检查 OS 层代码
- **预期**：OS 层不单独整理长期记忆，只消费 memory-core
- **验证方式**：代码审查

**TC-9.2: memory-core consolidation 接口正确**

- **输入**：Session 结束时调用 memory-core consolidation
- **预期**：history 正确提交给 memory-core
- **验证方式**：接口调用检查

**TC-9.3: memory-core 加载长期记忆正确**

- **输入**：Agent 启动时从 memory-core 加载长期记忆
- **预期**：正确加载 coreMemory、knowledge、patterns
- **验证方式**：加载结果检查

---

## 测试执行

### 单元测试

```bash
# 记忆管理单元测试
pnpm --filter @originos/core test -- memory

# 压缩策略单元测试
pnpm --filter @originos/core test -- compression

# 上下文装载单元测试
pnpm --filter @originos/core test -- context-loading
```

### 集成测试

```bash
# 单 Agent 集成测试
pnpm --filter @originos/core test -- single-agent

# 多 Agent 集成测试
pnpm --filter @originos/core test -- multi-agent
```

### 长会话回归测试

```bash
# 长会话回归测试
pnpm --filter @originos/core test -- long-session-regression
```

### 手动测试

1. 启动各类 Agent（Project/Agent/Skill/RoleAgent/Persistent）
2. 运行长会话（50 轮以上）
3. 检查 system prompt 内容
4. 检查压缩前后消息历史
5. 验证 loop 稳定性

---

## 验收标准测试

### AC-1: Dream 主路径移除

- **测试用例**：TC-1.1 ~ TC-1.3
- **预期结果**：Dream 不再自动调用，Memory.md 不追加 turn 摘要
- **通过标准**：100% 测试用例通过

### AC-2: Recall 注入移除

- **测试用例**：TC-2.1 ~ TC-2.3
- **预期结果**：Recall 不进入 system prompt
- **通过标准**：100% 测试用例通过

### AC-3: Recent Trace 保护

- **测试用例**：TC-3.1 ~ TC-3.4
- **预期结果**：压缩后保留最近执行轨迹、失败信息、约束
- **通过标准**：100% 测试用例通过

### AC-4: Memory.md 内容正确

- **测试用例**：TC-4.1 ~ TC-4.2
- **预期结果**：Memory.md 只保留长期稳定认知
- **通过标准**：100% 测试用例通过

### AC-5: 单 Agent 与多 Agent 一致

- **测试用例**：TC-5.1 ~ TC-5.4
- **预期结果**：所有 Agent 使用一致的记忆分层规则
- **通过标准**：100% 测试用例通过

### AC-6: Loop 稳定性

- **测试用例**：TC-6.1 ~ TC-6.4
- **预期结果**：长会话重复 tool loop 明显下降
- **通过标准**：loop 发生率 < 5%

### AC-7: 启动链路接入

- **测试用例**：TC-7.1 ~ TC-7.6
- **预期结果**：所有启动链路使用统一的记忆分层规则
- **通过标准**：100% 测试用例通过

### AC-8: 长会话回归

- **测试用例**：TC-8.1 ~ TC-8.4
- **预期结果**：长会话压缩后行为稳定
- **通过标准**：100% 测试用例通过

### AC-9: memory-core 接口边界

- **测试用例**：TC-9.1 ~ TC-9.3
- **预期结果**：OS 层只消费 memory-core，接口正确
- **通过标准**：100% 测试用例通过

---

## 测试报告模板

```markdown
# Story OS.13 测试报告

**测试日期**：YYYY-MM-DD
**测试人员**：[姓名]
**测试环境**：[环境描述]

## 测试执行摘要

| 测试类别 | 测试用例数 | 通过数 | 失败数 | 通过率 |
|---------|----------|--------|--------|--------|
| Dream 主路径移除 | 3 | | | |
| Recall 注入移除 | 3 | | | |
| Recent Trace 保护 | 4 | | | |
| Memory.md 内容 | 2 | | | |
| 单/多 Agent 一致性 | 4 | | | |
| Loop 稳定性 | 4 | | | |
| 启动链路接入 | 6 | | | |
| 长会话回归 | 4 | | | |
| memory-core 接口 | 3 | | | |
| **总计** | **33** | | | |

## 失败用例详情

### [用例编号]：[用例名称]

- **输入**：
- **预期结果**：
- **实际结果**：
- **失败原因**：
- **修复建议**：

## 长会话 Loop 统计

| 会话类型 | 会话轮数 | Loop 发生次数 | Loop 发生率 |
|---------|---------|--------------|------------|
| 单 Agent | | | |
| 多 Agent | | | |
| Supervisor | | | |

## 压缩前后对比

### 压缩前

- 消息总数：
- Recent Trace 数量：
- 失败信息数量：
- 约束数量：

### 压缩后

- 消息总数：
- Recent Trace 数量：
- 失败信息数量：
- 约束数量：
- 保留率：

## 测试结论

- [ ] 所有验收标准测试通过
- [ ] Dream 主路径已移除
- [ ] Recall 不再注入 system prompt
- [ ] Recent Trace 得到保护
- [ ] Loop 稳定性达标
- [ ] 可以合入主分支

## 备注

[其他需要说明的事项]
```

---

## 相关文档

- [需求规格](./requirements.md)
- [架构设计](./architecture.md)
- [Story OS.13 README](./README.md)
