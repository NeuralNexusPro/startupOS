# Design

## Context

见 `proposal.md`。当前访谈窗口已经读取完整 canonical ontology、展示行为草稿审阅，并通过 `AppWindowManager` 打开项目相关原生窗口；缺少的是结构化完成判定以及会话区到解决方案设计的交接组件。

## Goals / Non-Goals

**Goals:**

- 以持久化 canonical 数据和可信行为发布结果作为完成事实源。
- 在会话视觉流中显示确定性的访谈收尾，并复用既有解决方案窗口。
- 当前会话完成和重新进入已完成项目得到一致体验。

**Non-Goals:**

- 不创建新的访谈状态文件或第二事实源。
- 不把 UI 收尾卡片写成 Agent 历史消息。
- 不自动关闭访谈、自动发送解决方案首条消息或改变解决方案运行时。

## Decisions

### 完成判定由纯函数集中表达

在访谈 Web 组件目录提供只依赖 canonical DTO 的纯判定函数：概念、关系、Action、Rule 均至少存在一项，每个业务概念都至少由一个 FactType 描述数据形态，且没有单据字段缺口时才完成。可信行为草稿发布后重新读取 canonical 数据，因此恢复态和当前态使用同一个事实源。替代方案是匹配“访谈完成”等回复文本，但模型措辞不稳定且无法跨会话恢复，因此不采用。

### 缺口摘要必须进入访谈阶段门禁

项目本体只读摘要同时提供 FactType 未覆盖对象的数量和业务名称。Project Agent 每轮以该摘要判断阶段：只要仍有对象缺少数据形态，或 Action、Rule 尚未可信发布，就必须继续业务行为确认并指引右侧审稿，不得依赖“三类全部为空”这一特殊状态。这样部分发布、恢复会话和旧项目都使用同一门禁。

### 收尾提示作为会话尾部的系统卡片

`CUIDialogPanel` 接收完成状态和阶段跳转回调，将卡片渲染在消息列表之后、输入框之前。它属于确定性产品状态，不伪装为持久化 assistant 消息。替代方案是强制 Agent 输出按钮协议，但会把窗口导航耦合到模型输出解析，因此不采用。

### 复用解决方案原生窗口编排

`InterviewWindow` 使用现有 `AppWindowManager.openComponentWindow` 和 `SolutionDesign`，采用与首页一致的窗口 ID、项目参数和 metadata；已打开时由窗口管理器复用并聚焦。Web 组件只依赖 Web 服务和 core 公共类型，未引入 Desktop 内部依赖，符合 AGENTS.md 单向依赖要求。

### Agent 最终回复补充自然语言收尾约束

Project Agent prompt 在可信行为发布完成后的后续回复中，要求用业务语言明确告知访谈已完成并推荐进入解决方案设计；真正的按钮与完成状态仍由 UI 判定，模型回复不作为事实源。

## Risks / Trade-offs

- [部分极简项目没有业务规则] → 当前项目访谈契约已要求行动、事实与规则确认；保持严格条件，避免过早进入方案阶段。
- [草稿发布与 canonical 刷新之间短暂不同步] → 发布成功后立即重新读取 canonical，再更新完成状态。
- [已完成旧项目缺少部分新契约] → 不误报完成，用户仍可在访谈中补齐；不进行静默迁移。

## Migration Plan

上线无需数据迁移。已有完整项目重新打开时从 canonical 数据直接恢复收尾入口。回滚移除判定函数、收尾卡片及 prompt 补充即可，不改动持久化数据。

## 实施边界

- Core prompt：仅修改 `packages/core/src/lib/integrations/pi-agent/project-agent/` 及其测试。
- Web：仅修改 `packages/web/src/components/interview/` 及其测试。
- 两部分写入范围互不重叠，可以独立验证；本轮由主实现串行完成，不创建额外分支。
