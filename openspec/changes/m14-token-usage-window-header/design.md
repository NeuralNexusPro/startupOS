# Design：会话窗体顶部 Token 汇总

## 方案

在 `ChatMessageList` 保留会话消息的唯一输入，继续使用现有纯函数 `summarizeSessionTokenUsage(messages)`。新增可选 `headerContent`，由宿主在可滚动消息区之前渲染。提取一个轻量 `SessionTokenUsage` 展示组件，统一渲染可展开的真实 usage 与上下文估算。

这样汇总属于窗体顶部而不是任一消息，也不会随消息列表滚动；消息列表仅渲染消息、状态与任务内容。统计仍仅在 `message_end` 后随 `messages` 更新而重算。

## 架构与数据边界

- `packages/web/src/components/ui/chat/` 只依赖 `@originos/core` 的公共类型和 usage 纯函数，符合 Web 组件层向下依赖。
- 各宿主组件只传递现有消息数组，不复制聚合规则或修改 core。
- usage 的事实源仍为既有 assistant message/session JSON；本变更不引入状态、存储、IPC 或副作用。

## 无数据与可访问性

没有真实 usage 时不渲染顶部区域。详情使用原生 `details/summary`，键盘可操作，并继续将上下文数据标识为估算。

## 替代方案

- 在每个 Dialog 复制汇总逻辑：会造成显示不一致，拒绝。
- 新建 Zustand store：消息已是事实源，属于重复状态，拒绝。
- 将汇总固定在滚动列表内部：无法满足窗体顶部需求，拒绝。

## Subagent 实施边界

- Web UI subagent：仅写入 `packages/web/src/components/ui/chat/` 及对应定向测试。
- Integration owner：在 proposal integration branch 合并、执行验证与更新本 change 的任务证据；不得修改 Core、Desktop 或会话数据协议。
