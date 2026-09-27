# 访谈概念业务分类设计

## Context

`interview-ontology-sync.ts` 的概念参数仅接受 entity/class；`interview-ontology-sync-service.ts` 按名称追加，已有概念不修正；关系端点找不到会跳过；最少一个概念的限制妨碍只补关系。`project-canonical-ontology.ts` 与 `OntologyGraph.tsx` 沿用结构类型展示“类”。动机见 proposal.md。

## Goals / Non-Goals

目标是让用户理解已识别的业务概念，能纠错且保留关系。保留 Domain/Concept/Instance 和原 type 兼容；本 Story 不创建 Action，不做实例/类型迁移，不以相似名称去重。

## Decisions

### 业务分类是概念的独立维度

在 CanonicalConcept 增加可选 `semanticKind`：`role | organization | object | activity | document | standard | unclassified`。缺失按 unclassified 读取，不触发写入。保留 type 原义，不用分类推断 instance。分类来源增加可选类型化 `classificationSource`（访谈 sourceRef、来源 agent/user、是否经用户确认），不保存完整对话。用户纠正后 Agent 不得静默覆盖，需提出新建议。

| 中文标签 | 示例 | 边界 |
|---|---|---|
| 业务角色 | SQE、审核员 | 职责身份，不是某个人实例 |
| 组织 | 供应商、质量部门 | 组织概念；某家供应商是实例 |
| 业务对象 | 来料批次、质量问题 | 被管理的业务对象 |
| 业务活动 | 来料检验、现场审核 | 业务过程描述；不等同 Action |
| 文档 | 8D 报告、检验记录 | 信息载体 |
| 标准 | 验收规范 | 规范概念；不等同可执行 Rule |
| 待分类 | 无足够证据的概念 | 不凭名称猜测 |

一个概念只指定一个主要展示分类。跨角色语义由关系表达，不复制节点以满足多个分类。分类不授予权限、改变状态或参与 Action gate。

选择独立可选字段而非替换 type，以保持旧调用方兼容；不用 attributes 魔法键，保证校验和 UI 有明确契约；不只改“类”的中文文案，避免掩盖分类缺失。

### 修改链路与所有权

访谈工具 → project feature 编排 → ontology 公共 authoring → canonical store → 权威快照投影 → 图谱/列表/记忆摘要。ontology 所有类型、分类校验、写入与 revision；project 所有访谈来源映射；Web/Desktop 只传 DTO 和展示。下层 project-agent 仅接收注入上下文，禁止导入 feature 业务实现。客户端导出保持纯类型/纯函数，不导入 node:crypto/fs。

工具允许概念增补、按 conceptId 修正分类、仅补关系三类有效请求；全部为空拒绝。旧名称接口保持兼容：只在归一化名称精确唯一时解析；多候选返回歧义，未知端点返回字段级 issue；新 UI 始终使用稳定 ID。别名合并与占位概念删除不在本 Story，先提示人工处理。

按命令调用既有 authoring，返回逐项 accepted/rejected 的结构化结果及最新 revision；未成功项不能显示“已同步”。本 Story 不承诺跨概念/关系的原子批次；同次请求按概念→关系串行，成功项用确定性子 operationId 防重，冲突停止后续写入并请求刷新。1.8 再引入契约定义的全有或全无批次。

### 旧数据、记忆和界面

用户点击“整理概念分类”→只读建议及证据→勾选确认→基于 expectedRevision 提交。启动、查询、恢复不写旧数据。任何分类修改保持 conceptId、relationId、端点及历史引用。

图谱图例和卡片统一使用上述中文词，原结构类型在高级详情查看。实体页改为概念页；关系继续展示 source→label→target。未分类有独立筛选。关系更新从成功回执失效刷新；不得用本地乐观节点覆盖权威快照。错误原位展示，支持键盘操作；深浅色均使用主题 token。超过 50 节点走虚拟化/裁剪并保留可访问列表。

记忆只记录 sourceRefs、分类修正摘要与 ontology ID/version/revision。通过同一 owner 的既有记忆管理入口更新，不另建独立 Memory 写入者；失败可按 revision 重建摘要，不回滚本体；不把本体全量或分类字典逐轮追加 stable prompt。访谈原始历史仍由原有历史文件保留，不复制进每轮上下文。

## Risks / Trade-offs

- 旧序列化器剥离可选字段 → 覆盖 store/IPC/API round-trip 测试；旧写客户端不安全时阻止编辑，不声称随意降级可写。
- 并发修正和访谈追加冲突 → authoring CAS、明确错误和刷新，不盲重试。
- 旧项目技能提示词仍输出 class → 修改受维护模板及运行工具描述；尊重用户自定义文件，不覆盖；约束由工具 schema 最终执行。
- 分类建议可能错误 → 待分类兜底、证据可见、人工修正保护。

## Migration Plan

先加向后兼容类型和 parser，再接访谈服务与投影、最后开放分类确认。既有文件不自动迁移。回滚隐藏分类操作但保留字段；补偿修改需当前 revision，拒绝覆盖后续写入。首个本体仍需满足至少一个领域、2–3 个概念的访谈目标；工具接纳后的初始投影目标 5 秒内，不将 LLM 等待计入该计时。

## 实施边界

在隔离 Task worktree 实施。核心角色写 ontology 类型/校验/传输；访谈角色写 project/agent 业务、project-agent 提示词和模板；UI 角色写 Web 投影与组件、Desktop 薄适配。先冻结公共 DTO，后两者可在不重叠范围并行；公共导出由核心角色唯一维护。集成角色负责最终回归与证据，不在 Proposal 主 worktree 改源码。
