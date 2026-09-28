# 需求 - Story A2UI.4

**Story:** 卡片动作事件回路与 Agent 协议
**Epic:** Epic A2UI
**最后更新:** Planning 阶段

---

## 用户故事

作为用户，我希望能在 Agent 生成的卡片上直接确认、选择、提交参数或请求详情，并让 Agent 基于这些结构化操作继续推进任务。

---

## 背景

生成式交互卡片的价值不只是展示，还包括缩短用户与 Agent 的操作回路。用户动作必须通过会话通道回传，而不是由前端卡片直接调用工具或修改运行时状态。

---

## 功能需求

### 范围

1. 定义 action schema：
   - `event`：普通事件，如查看详情。
   - `submit`：表单提交。
   - `confirm`：确认/取消。
   - `select`：选择项。
   - `retry`：请求 Agent 重试或继续。
2. 定义事件 payload：
   - `sessionId`
   - `messageId`
   - `agentId`
   - `cardId`
   - `actionId`
   - `actionType`
   - `value`
   - `clientTimestamp`
3. 定义事件回传语义：
   - 作为用户消息进入 Pi Agent 会话。
   - 作为协作运行时事件进入多 Agent session。
   - 保留原始卡片上下文，便于 Agent 理解用户操作来源。
4. 定义幂等与状态：
   - 同一 action 可配置是否允许重复触发。
   - 提交中、已提交、失败、可重试状态必须明确。
5. 定义权限边界：
   - 卡片事件不能直接执行系统工具。
   - 危险操作必须经过 Agent 或系统确认链路。

### 非范围

- 不实现事件分发器。
- 不改造现有 Agent 消息 API。
- 不设计复杂 workflow 引擎。
- 不允许卡片绕过 Agent 直接执行本地文件、网络或系统命令。

---

## 规划产物

| 产物 | 说明 |
|------|------|
| Action schema | 动作类型、按钮展示、输入值、幂等策略 |
| Event payload | 前端回传给会话层的标准事件结构 |
| Agent 可读消息格式 | 将卡片事件转换为 Agent 可理解上下文的文本/结构化消息 |
| 状态机 | idle、pending、submitted、failed、disabled |
| 安全规则 | 危险动作确认、会话绑定、重复提交保护 |

---

## 验收标准

- [ ] 每个动作事件都能绑定到唯一的 session/message/agent/card/action。
- [ ] 用户动作必须通过会话或协作运行时通道回传，卡片不得直接调用工具。
- [ ] 表单提交和确认操作有 pending、success、error、retry 的状态规划。
- [ ] 重复点击、消息刷新、会话恢复后的幂等策略已说明。
- [ ] Agent 收到事件时能获得足够上下文理解用户操作意图。

---

## 后续实现建议

未来实现时，可先把 A2UI action 转换为一条受控用户消息，例如"用户在卡片 X 上选择了 Y"，再逐步增加结构化事件通道，避免一次性改动 Agent 会话协议。
