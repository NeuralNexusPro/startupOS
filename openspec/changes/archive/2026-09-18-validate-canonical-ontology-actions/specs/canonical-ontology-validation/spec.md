## ADDED Requirements

### Requirement: canonical ontology 标识唯一
Validator SHALL 校验每种 canonical 集合中的稳定 ID 唯一，并 MUST 对重复项返回 `DUPLICATE_ID` 与具体字段路径。

#### Scenario: 概念 ID 重复
- **WHEN** ontology 中两个 concepts 使用相同 ID
- **THEN** Validator MUST 返回 invalid 结果并定位第二个重复 ID

### Requirement: canonical 交叉引用完整
Validator SHALL 校验 Domain/Concept/Instance、Property、Relation、BusinessState、Transition、FactType、Action、DomainEvent 和 Projection 的所有显式引用存在且属于正确概念；损坏引用 MUST 返回结构化错误而非抛出或静默忽略。

#### Scenario: Action 引用其他概念的状态
- **WHEN** Action 的 fromStateIds 或 toStateId 指向不属于该 Action concept 的状态
- **THEN** Validator MUST 返回 `INVALID_STATE_BINDING` 并定位对应字段

#### Scenario: Projection 引用不存在的 FactType
- **WHEN** Projection 的 sourceFactTypeIds 包含未知 ID
- **THEN** Validator MUST 返回 `MISSING_REFERENCE` 并定位对应数组项

### Requirement: Action Gate 校验本体身份与版本
Action Gate MUST 要求请求的 ontologyId 和 ontologyVersion 与被校验 ontology 完全一致。

#### Scenario: 请求版本过期
- **WHEN** 请求携带的 ontologyVersion 与当前 ontology version 不同
- **THEN** Action Gate MUST 返回 `ONTOLOGY_VERSION_MISMATCH` 且不得返回 valid

### Requirement: Action Gate 校验 Action 与 Concept 绑定
Action Gate SHALL 要求 actionId 存在且 Action 的 conceptId 与请求 conceptId 一致。

#### Scenario: Action 属于其他概念
- **WHEN** 请求 conceptId 与 Action 定义的 conceptId 不同
- **THEN** Action Gate MUST 返回 `ACTION_CONCEPT_MISMATCH`

### Requirement: Action Gate 校验当前业务状态
当 Action 声明 fromStateIds 时，Action Gate MUST 要求 currentStateId 存在、属于目标概念且位于允许集合；未声明 fromStateIds 时 SHALL 不要求当前状态。

#### Scenario: 缺少必需当前状态
- **WHEN** Action 声明了 fromStateIds 而请求未提供 currentStateId
- **THEN** Action Gate MUST 返回 `STATE_REQUIRED`

#### Scenario: 当前状态不允许
- **WHEN** currentStateId 属于目标概念但不在 Action 的 fromStateIds 中
- **THEN** Action Gate MUST 返回 `STATE_NOT_ALLOWED`

### Requirement: Action Gate 校验最小权限集合
Action Gate MUST 要求请求 permissions 包含 Action 声明的全部 permissions，并 SHALL 为每个缺失权限返回 `PERMISSION_DENIED`。

#### Scenario: 缺少一项 Action 权限
- **WHEN** Action 需要两项权限而请求只提供一项
- **THEN** Action Gate MUST 返回缺失权限对应的 `PERMISSION_DENIED`

### Requirement: 校验过程无副作用且结果确定
两个校验 API MUST 不修改输入 ontology，且相同输入 SHALL 产生顺序稳定的等值结果。

#### Scenario: 重复校验合法请求
- **WHEN** 调用方对同一 ontology 和 Action 请求连续校验两次
- **THEN** 两次结果 SHALL 等值且输入对象保持不变
