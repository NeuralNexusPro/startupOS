# Spec Delta

## Purpose

为方案发布提供唯一、无副作用的 Agent/Skill 语义契约校验边界，使本体引用、Action 权限和 SOP 必需事实连通性在生成运行契约前得到确定验证。

## ADDED Requirements

### Requirement: 契约必须绑定当前本体
系统 SHALL 要求 Agent/Skill contract 的 ontology ID/version 与被校验 ontology 完全一致，并 MUST 先拒绝结构损坏的 ontology。

#### Scenario: 契约引用旧版本
- **WHEN** contract ontologyVersion 与当前 ontology version 不同
- **THEN** Validator MUST 返回 `ONTOLOGY_VERSION_MISMATCH`

### Requirement: Fact 声明必须引用合法类型
系统 SHALL 校验每个 input/output FactType 存在、Concept 绑定正确且同一方向不重复声明；失败 MUST 包含稳定 code 和字段路径。

#### Scenario: input FactType 属于其他 Concept
- **WHEN** input 中的 conceptId 与 FactType 定义不一致
- **THEN** Validator MUST 返回 `INVALID_CONCEPT_BINDING` 并定位该 input

### Requirement: Action binding 与权限必须完整
系统 SHALL 校验每个 Action 存在且绑定正确 Concept，并 MUST 要求 contract permissions 覆盖所有已绑定 Action 声明的权限。

#### Scenario: Agent 缺少 Action 权限
- **WHEN** Agent contract 绑定的 Action 需要一项 contract 未声明的权限
- **THEN** Validator MUST 返回 `PERMISSION_DENIED`

### Requirement: Flow 节点与边引用必须完整
系统 SHALL 校验 flow node ID 唯一，edge 的来源和目标节点存在，且 edge FactType 属于当前本体。

#### Scenario: Edge 指向未知节点
- **WHEN** edge 的 toNodeId 不存在
- **THEN** Flow Validator MUST 返回 `MISSING_REFERENCE` 并定位 toNodeId

### Requirement: Edge 必须连接兼容的输出与输入
每条 edge 的 FactType MUST 由来源节点 outputs 声明并由目标节点 inputs 声明；任一端不兼容 MUST 被结构化拒绝。

#### Scenario: 上游不生产 edge FactType
- **WHEN** edge 引用的 FactType 未出现在来源 contract outputs
- **THEN** Flow Validator MUST 返回 `OUTPUT_NOT_PRODUCED`

#### Scenario: 下游不消费 edge FactType
- **WHEN** edge 引用的 FactType 未出现在目标 contract inputs
- **THEN** Flow Validator MUST 返回 `INPUT_NOT_CONSUMED`

### Requirement: 必需输入必须有静态来源
每个 node 的 required input MUST 由兼容的入边或 flow externalInputs 提供；optional input SHALL 不要求来源。

#### Scenario: 必需输入断流
- **WHEN** required input 没有兼容入边且未声明为 external input
- **THEN** Flow Validator MUST 返回 `REQUIRED_INPUT_UNBOUND` 并定位该 node input

### Requirement: 校验必须确定且无副作用
Contract 与 Flow Validator MUST 不修改输入、不访问文件系统，且相同输入 SHALL 产生顺序稳定的等值 issues。

#### Scenario: 重复校验同一 flow
- **WHEN** 调用方连续校验同一 ontology 与 flow
- **THEN** 两次结果 SHALL 等值且输入保持不变
