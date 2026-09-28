# 需求 - Story A2UI.2

**Story:** 聊天消息渲染接入与 Markdown 降级
**Epic:** Epic A2UI
**最后更新:** Planning 阶段

---

## 用户故事

作为用户，我希望 Agent 在聊天中生成的图表、表格和操作卡片能直接以内嵌卡片呈现；当当前客户端不支持该卡片时，我仍能看到可读的 Markdown 降级内容。

---

## 背景

当前聊天 UI 以 Markdown 渲染为主。A2UI 需要接入聊天消息流，但不能破坏普通 Markdown、代码块、文件引用和现有多 Agent 消息结构。首版应支持两种来源：结构化消息字段和 Markdown 中的受控 `a2ui` fenced block。

---

## 功能需求

### 范围

1. 规划聊天消息中 A2UI 的承载方式：
   - 优先：消息结构化字段 `a2uiCards`。
   - 过渡：Markdown fenced block ` ```a2ui `。
2. 规划渲染顺序：文本段落、A2UI 卡片、错误降级块之间的组合规则。
3. 规划失败降级：
   - JSON 解析失败。
   - schema 校验失败。
   - 组件未注册。
   - 版本不支持。
   - 客户端能力不足。
4. 规划多 Agent 场景下的卡片归属：agentId、messageId、traceId、cardId。
5. 规划无障碍与可复制策略：用户可复制 fallback 文本，不依赖图形才能理解关键信息。

### 非范围

- 不重写现有 Markdown 渲染器。
- 不引入 ECharts 或其他具体图表库。
- 不处理用户动作回传，该能力由 A2UI.4 规划。

---

## 规划产物

| 产物 | 说明 |
|------|------|
| 消息承载规范 | 结构化字段与 fenced block 的优先级、解析规则、错误处理 |
| 渲染生命周期 | parse、validate、resolve component、render、fallback |
| 降级策略 | 每类错误对用户展示什么、对开发者记录什么 |
| 多 Agent 归属字段 | `sessionId`、`messageId`、`agentId`、`cardId` 的绑定方式 |

---

## 验收标准

- [ ] 明确 A2UI 与 Markdown 共存规则，不破坏普通代码块渲染。
- [ ] 明确结构化字段优先于 fenced block，fenced block 仅作为过渡方案。
- [ ] 每个 A2UI payload 必须有 `fallbackMarkdown`，否则视为校验失败。
- [ ] 多 Agent 消息中的卡片必须能追踪到来源 Agent 和原始消息。
- [ ] 渲染失败时用户可见文本不为空，开发侧可记录错误原因。

---

## 后续实现建议

未来实现时，A2UI 渲染入口可通过聊天消息组件注入，避免让 Markdown 渲染器承担业务协议职责。`packages/core/src/modules/collaboration-runtime/ui/` 只应通过 UI 依赖注入消费 A2UI 渲染器。
