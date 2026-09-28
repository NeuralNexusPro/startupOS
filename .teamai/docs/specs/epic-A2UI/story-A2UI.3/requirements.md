# 需求 - Story A2UI.3

**Story:** 首批生成式交互卡片组件集
**Epic:** Epic A2UI
**最后更新:** Planning 阶段

---

## 用户故事

作为用户，我希望 Agent 能把分析结果生成可读、可操作的卡片，例如 ECharts 图表、数据表、指标卡、确认卡和参数表单，从而减少纯文本来回解释。

---

## 背景

A2UI 首版不应追求完整 UI DSL，而应覆盖 OriginOS 当前最常见的交互场景：分析可视化、结构化数据浏览、用户确认、参数收集和任务进度反馈。

---

## 功能需求

### 首批卡片类型

| 组件 ID | 用途 | 首版能力 |
|---------|------|----------|
| `chart.echarts` | 可视化图表 | 渲染受控 ECharts option，支持柱状、折线、饼图、散点等基础图 |
| `data.table` | 结构化表格 | 列定义、行数据、排序提示、分页提示、单元格类型 |
| `metric.kpi` | 指标摘要 | 数值、单位、趋势、状态、说明 |
| `choice.confirm` | 决策确认 | 确认/取消、多选一、带风险说明的操作确认 |
| `form.schema` | 参数收集 | 文本、数字、选择、开关、日期等受控字段 |
| `status.progress` | 任务状态 | 步骤、进度、当前阶段、错误与重试提示 |

### 视觉原则

- 卡片应服务操作和信息密度，不做营销式大面积装饰。
- 字体层级、按钮、图表图例、表格单元格都必须在窄屏下不溢出。
- 卡片外观遵守现有 Tailwind / shadcn/ui 风格，不引入独立设计系统。
- ECharts 卡片必须有固定高度与响应式宽度，避免消息流布局跳动。
- 所有关键信息必须能在 `fallbackMarkdown` 中表达。

### 非范围

- 不支持任意自定义组件。
- 不支持 Agent 输出 CSS 或组件源码。
- 不支持复杂数据透视、BI 建模或图表编辑器。
- 不实现卡片组件。

---

## 规划产物

| 产物 | 说明 |
|------|------|
| 卡片组件清单 | 首批 6 类组件的职责、输入、交互边界 |
| Props schema 草案 | 每类卡片的核心字段和限制 |
| ECharts 安全限制 | 禁止函数、脚本、远程资源、超大 series、危险 formatter |
| UI 状态清单 | loading、empty、invalid、unsupported、interactive、submitted |

---

## 验收标准

- [ ] 首批卡片类型已覆盖图表、表格、指标、表单、确认、进度六类场景。
- [ ] 每类卡片都明确最小 props、可选 props、大小限制和 fallback 要求。
- [ ] `chart.echarts` 明确只能使用 JSON 可序列化 option，不允许函数 formatter。
- [ ] 表单类卡片明确字段类型、校验错误和提交 payload 结构。
- [ ] 状态类卡片明确如何表达任务进行中、完成、失败和可重试。

---

## 后续实现建议

未来实现时，可先实现只读卡片：`chart.echarts`、`data.table`、`metric.kpi`、`status.progress`；再实现带动作的 `choice.confirm` 和 `form.schema`，降低交互回路风险。
