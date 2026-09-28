# Story A2UI.3: 首批生成式交互卡片组件集

**Story 编号:** A2UI.3  
**所属 Epic:** [Epic A2UI](../README.md)  
**优先级:** 🟠 High  
**状态:** 📋 Planning  
**范围说明:** 本 Story 仅做规划，不包含实现。

---

## 📋 用户故事

作为用户，我希望 Agent 能把分析结果生成可读、可操作的卡片，例如 ECharts 图表、数据表、指标卡、确认卡和参数表单，从而减少纯文本来回解释。

---

## 🎯 目标

规划首批 6 类生成式交互卡片组件，覆盖最常见的交互场景。

---

## 📚 文档导航

- **[需求文档](./requirements.md)** — 用户故事、功能需求、卡片类型、验收标准

---

## 🔗 相关文档

- [Epic A2UI README](../README.md)

---

**后续实现建议：** 可先实现只读卡片：`chart.echarts`、`data.table`、`metric.kpi`、`status.progress`；再实现带动作的 `choice.confirm` 和 `form.schema`，降低交互回路风险。
