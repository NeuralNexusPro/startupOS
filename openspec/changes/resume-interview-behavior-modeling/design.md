# Design

## Context

见 proposal.md。canonical ontology 已经是项目语义的唯一事实源；访谈恢复只可读取其摘要和完整模型，不能回退读取 `business-model.json`。

## Goals / Non-Goals

**Goals:**

- 以现有 canonical ontology 的结构完整度判定是否要恢复业务行为确认。
- 让 Project Agent 和访谈右侧面板呈现一致阶段，并保持草稿确认后才发布的边界。
- 保持旧项目入口 DTO 的向后兼容。

**Non-Goals:**

- 不自动从概念描述推断或发布事实类型、行动、规则、状态和流转。
- 不迁移或改写历史会话、旧 JSON 模型或已发布 canonical ontology。
- 不在方案设计阶段写入项目本体。

## Decisions

### 以 canonical 完备性作恢复判定

当 ontology 同时具有概念和关系，且 FactType、Action、Rule 均为空时进入业务行为确认。状态和流转不单独作为进入条件，避免已部分建模项目反复进入该阶段。选择结构化字段而不是会话文本，因为 canonical ontology 是跨会话唯一可靠的事实源。

### 共享摘要、完整模型与界面提示的职责

项目入口摘要提供可选的计数，以便现有 DTO 使用方在升级期间保持兼容；Project Agent 只使用摘要决定提示。访谈界面读取完整 canonical ontology，展示业务行为确认标识、说明和行动标签页。带历史会话时使用既有无用户消息的 greeting 机制续接，避免伪造聊天记录。

### 不改变发布路径

恢复路径仍然只允许保存行为草稿；可信界面确认继续复用现有 canonical 发布边界。替代方案是恢复时自动生成契约，但它会把描述性访谈误当作权限、状态与输入输出均已确认的可执行事实，因此拒绝采用。

## Risks / Trade-offs

- [部分发布的行为模型可能不满足完整业务需求] → 判定只避免“完全未开始”被遗漏；后续缺口仍由方案设计只读报告。
- [历史会话包含过时内容] → greeting 以当前 canonical ontology 为准，不重放或修改历史消息。
- [摘要字段升级影响旧测试或调用方] → 新计数字段保持可选，服务实现仍始终填充。

## Migration Plan

部署后打开项目时仅做只读判定。回滚时移除恢复阶段提示；不会删除草稿或改写已发布本体。
