# 需求 - Story A2UI.1

**Story:** A2UI v1 协议与组件注册表
**Epic:** Epic A2UI
**最后更新:** Planning 阶段

---

## 用户故事

作为 Agent Runtime，我希望用稳定、可校验、可版本化的 A2UI payload 描述交互卡片，以便前端可以安全渲染结构化 UI，而不是解析不稳定的自然语言或任意 HTML。

---

## 背景

聊天消息未来会同时包含普通 Markdown 和生成式 UI。若缺少协议层，ECharts、表格、表单、确认操作等能力会分散为多个临时 Markdown 扩展，后续难以治理、安全审计和跨端复用。

---

## 功能需求

### 范围

1. 定义 A2UI v1 envelope 字段和类型命名规范。
2. 定义组件注册表结构：组件 ID、props schema、动作 schema、fallback 策略。
3. 定义首版组件命名空间：
   - `chart.echarts`
   - `data.table`
   - `metric.kpi`
   - `choice.confirm`
   - `form.schema`
   - `status.progress`
4. 定义 schema 校验错误格式和渲染器可消费的标准错误对象。
5. 定义协议版本兼容策略：`a2ui/v1` 起步，未知版本必须降级。

### 非范围

- 不实现 schema 校验器。
- 不实现任何 React 组件。
- 不定义具体视觉样式。
- 不允许远程加载组件代码。

---

## 规划产物

| 产物 | 说明 |
|------|------|
| A2UI envelope 规范 | `version`、`id`、`kind`、`component`、`props`、`actions`、`fallbackMarkdown` 等字段定义 |
| 组件注册表规范 | 组件 ID 命名、props/action schema 引用、版本兼容 |
| Payload 示例 | 图表、表格、确认、表单、进度等最小样例 |
| 错误模型 | 校验失败、组件缺失、版本不支持、数据超限 |

---

## 验收标准

- [ ] A2UI v1 字段表完整，必填/可选、类型、语义和限制清晰。
- [ ] 组件 ID 采用稳定命名空间，禁止业务临时名称污染协议层。
- [ ] 每个首批组件都声明 props schema 归属和 fallback 要求。
- [ ] 未知组件、未知版本、props 校验失败时的降级行为已写明。
- [ ] 明确禁止函数、脚本、任意 HTML、任意 CSS 和远程组件注入。

---

## 后续实现建议

未来实现时，协议类型建议放在 `packages/core/src/modules/a2ui/`，保持纯数据和纯函数边界；Web 渲染器只消费协议，不反向依赖 Agent 内部实现。
