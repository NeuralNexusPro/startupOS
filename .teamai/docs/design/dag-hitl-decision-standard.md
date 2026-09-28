# DAG HITL 输入判定标准

**版本：** 1.0.0
**日期：** 2026-05-20
**状态：** Draft

---

## 1. 概述

DAG 多 Agent 协作运行时中，每个 Agent 节点的执行结果需要被判定为 `completed`、`waiting` 或 `failed` 三种状态之一，以决定是否触发下游节点。

本文档定义**谁负责判定**、**判定的依据**、以及**判定规则**。

---

## 2. 职责归属

### 2.1 Worker 层（执行层）

Worker（`agent-worker.mts`）**不负责**判定何时暂停。它的职责是：

- 执行 Agent loop（prompt → LLM → 工具调用 → 输出）
- 将执行过程中的事件流完整上报
- 在 `agent_end` 事件中返回完整消息历史
- 支持被外部暂停和恢复（`resume()` / `continueAfterResume()`）

Worker 不应根据自身输出内容做业务判定。它只做执行，不决定"我该不该停下来等用户"。

### 2.2 DAG 层（决策层）

DAG 执行编排层（`multi-agent-executor.ts`）负责判定。具体职责：

- Agent loop 完成后，分析其执行结果（消息历史、工具调用记录、事件流）
- 调用判定函数 `decideNodeStatus()` 决定节点状态
- 返回对应状态给 `DagExecutor`，由其决定是否触发下游

**判定函数签名**：

```typescript
function decideNodeStatus(result: {
  hasToolCalls: boolean;
  lastAssistantMessage: string;
  events: RuntimeEvent[];
  turnCount: number;
}): {
  status: "completed" | "waiting" | "failed";
  reviewRequest?: { question: string; context?: Record<string, unknown> };
  output?: string;
};
```

---

## 3. 判定规则 v1.0

| 状态 | 触发条件 | 下游行为 |
|------|---------|---------|
| `completed` | Agent 正常完成，且输出包含明确产出（非提问结尾，或已执行了工具调用） | 触发下游 trigger 边 |
| `waiting` | Agent 正常完成，但全程未调用工具且输出以提问结尾 | 暂停，等待用户回复后继续 |
| `failed` | Agent 抛出异常或超时 | 标记下游为失败 |

### 3.1 `completed` 判定

满足以下任一条件即判定为 `completed`：

1. Agent 调用了至少一次工具 → 说明已执行了工作，产出明确
2. Agent 未调用工具，但最后一条 assistant 消息**不以问号结尾** → 说明已完成任务输出

### 3.2 `waiting` 判定

**同时满足**以下所有条件即判定为 `waiting`：

1. Agent 全程未调用任何工具（`hasToolCalls === false`）
2. 最后一条 assistant 消息以 `?` 或 `？` 结尾
3. 输出内容整体呈现提问意图（信息收集类问题，而非修辞问句）

判定为 `waiting` 时，提取问题文本作为 `reviewRequest.question`。

### 3.3 `failed` 判定

- Agent 抛出未捕获异常
- Agent 超时（超过配置的 `timeoutMs`）

---

## 4. 判定依据

### 4.1 v1.0 依据来源

v1.0 判定基于 Agent 执行结果的**原始信号**：

| 信号 | 来源 | 用途 |
|------|------|------|
| 工具调用记录 | 事件流中的 `tool_execution_start` | 判断 Agent 是否执行了工作 |
| 最后一条 assistant 消息 | `agent_end` 事件中的 messages 数组 | 判断是否以提问结尾 |
| 异常/超时 | `proc.prompt()` 的 reject | 判断是否失败 |

### 4.2 当前实现位置

| 组件 | 当前状态 |
|------|---------|
| `agent-worker.mts` | **不应**包含 HITL 判定逻辑（待修复） |
| `multi-agent-executor.ts` | 应包含 `decideNodeStatus()` 函数（待新增） |

---

## 5. 未来扩展方向

### 5.1 意图分类器（Phase 3）

引入轻量级意图分类模型，将 Agent 输出分类为：

- `task_complete`：任务已完成，有明确产出
- `info_gathering`：需要补充信息，向用户提问
- `clarification`：需要澄清，不确定用户意图
- `error`：Agent 遇到错误无法继续

替代 v1.0 的简单文本匹配规则。

### 5.2 规则引擎

支持配置化 HITL 触发规则，例如：

```yaml
rules:
  - name: "project-config-needs-input"
    agentId: "project-config"
    trigger: "always"  # 此 Agent 始终等待用户输入
  - name: "generic-question"
    trigger: "lastMessageEndsWithQuestion"
    excludeIf: "hasToolCalls"
```

### 5.3 多轮交互

支持 Agent 与用户进行多轮问答后再判定为 `completed`：

- Agent 提出问题 → `waiting`
- 用户回复 → Agent 继续分析
- Agent 可能继续提问 → 再次 `waiting`
- 直到 Agent 产出明确结果 → `completed`

---

## 6. 设计原理

### 6.1 为什么判定权不在 Worker

1. **职责分离**：Worker 是沙箱执行环境，不应包含业务逻辑
2. **可测试性**：DAG 层的判定逻辑可独立于 Agent 执行进行测试
3. **可扩展性**：未来引入意图分类器时，只需修改 DAG 层，不改动 Worker
4. **安全边界**：Worker 运行在受限环境中，复杂的判定逻辑增加攻击面

### 6.2 为什么 v1.0 仍然使用简单规则

- MVP 阶段够用，能快速验证 HITL 流程
- 简单规则易于理解和调试
- 为意图分类器提供基线对比数据
