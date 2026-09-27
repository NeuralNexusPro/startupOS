# 方案图谱视图闭环设计

## Context
参照本 Story 审计，当前存在部分组件，缺少产品或运行时接线。

## Goals / Non-Goals
补齐已批准范围，保持现有权威契约与状态；不增加自动数据迁移或新事实源。

## Decisions
- 使用现有 canonical 类型；本任务只读展示，不新增数据写入，不改变发布校验。旧 manifest 显式作为兼容视图，不能推断为已发布契约。
- Web 展示适配位于 components/solution，可提取纯图数据构建模块和类型；避免 any 与新增内联样式，SVG 坐标使用属性。
- 两种视图必须语义不同：工作流遵循显式节点/边，团队按 Agent 与共享 Skill 关系展示；不可只切 dagre rankdir。
- 缺引用应展示可定位诊断，不默默删除边。按 canonical FactType 引用保留契约详情，不能压缩成仅对象名。
- 小规模布局用现有 dagre；缓存布局，性能测试阈值 5 秒，不引入网络或新依赖。
- 替代方案在 core 校验中增加 UI 逻辑会污染业务边界，故保持展示投影与既有发布门控分离。
- 受影响文件只在 packages/web/src/components/solution 及测试和 P2.7 文档；不修改 core types（P2.6 所有）、API 或 runtime。

## Risks / Trade-offs
存量组件行为可能与新 canonical 链路不一致 → 使用真实入口集成测试，发现冲突记录 Story 映射；不以孤立单测通过宣告全部完成。

## 实施边界
单一 subagent 在独立 Task worktree 实施上述文件，父代理负责规格与集成；与其他 Proposal 写入范围不重叠可并行。涉及跨路径接口时先通过公共 API。

## Migration Plan
无数据迁移，读取不得触发写入副作用。审查后按既定顺序集成本地 0.4.x，后续 dev/远端由用户另行指示。保留现有和本轮 worktree。
