# ontology-facts-actions-api Specification

## Purpose

为运行时提供唯一的 canonical facts 查询与 Action 提交边界，使类型、版本、权限、修订和幂等要求在写入 append-only 事实流前得到一致执行，并留下可恢复的审计回执。

## Requirements

### Requirement: 类型化事实查询必须绑定当前本体
系统 SHALL 在返回事实前校验 project、ontology ID/version 以及可选 Concept/FactType 过滤条件；身份、版本或引用不匹配 MUST 返回结构化拒绝，不得混入其他本体版本的事实。

#### Scenario: 查询过期本体版本
- **WHEN** 调用方使用非当前 ontologyVersion 查询 facts
- **THEN** 系统 MUST 返回版本不匹配 issue 且不返回事实

#### Scenario: 查询指定 FactType
- **WHEN** 当前本体包含目标 FactType 且请求身份与版本一致
- **THEN** 系统 SHALL 仅返回该 FactType 的匹配事实

### Requirement: 最新事实查询必须确定
系统 SHALL 支持按 `factId` 返回最高 revision 的记录；revision 相同时 SHALL 使用后追加记录，结果顺序 MUST 稳定。

#### Scenario: 同一 factId 有多个修订
- **WHEN** facts 流包含同一 factId 的 revision 1 和 revision 2
- **THEN** latest 查询 SHALL 只返回 revision 2

### Requirement: Action 提交必须在写入前完成门控
系统 MUST 在写入 intent 或 facts 前校验本体身份与版本、Action/Concept、当前状态、权限、输入事实存在性、输出 FactType 和 expectedRevision。业务拒绝 SHALL 返回结构化 issues。

#### Scenario: 输出事实修订冲突
- **WHEN** 输出 factId 的当前 revision 与请求 expectedRevision 不同
- **THEN** 系统 MUST 返回 `REVISION_CONFLICT` 且不得追加 intent 或事实

#### Scenario: 输入事实不存在
- **WHEN** 请求引用的输入 fact 无法按完整稳定引用定位
- **THEN** 系统 MUST 拒绝 Action 且不得写入输出事实

### Requirement: Action 只接纳声明的事实类型
系统 SHALL 要求输入覆盖 Action 声明的全部 input FactType，并要求每个输出属于 Action 声明的 output FactType；FactType 与 Concept 绑定 MUST 从当前本体定义解析，不信任调用方提供的概念字段。

#### Scenario: 提交未声明的输出 FactType
- **WHEN** Action 请求包含不在 outputFactTypeIds 中的 FactType
- **THEN** 系统 MUST 返回结构化拒绝且不追加该事实

### Requirement: operationId 必须提供幂等提交和冲突检测
系统 SHALL 使用 `operationId` 关联 intent、输出事实和终态回执。相同请求重试 MUST 返回既有终态且不得重复事实；相同 operationId 携带不同请求 MUST 被拒绝。

#### Scenario: accepted 请求重试
- **WHEN** 已 accepted 的 operationId 以相同请求再次提交
- **THEN** 系统 SHALL 返回原 accepted 回执且 facts 流行数不变

#### Scenario: operationId 被不同请求复用
- **WHEN** 已记录的 operationId 收到不同 action、版本或输出内容
- **THEN** 系统 MUST 返回 `OPERATION_CONFLICT` 且不得覆盖原回执

### Requirement: 未完成 intent 必须可恢复
系统 MUST 能从持久化 intent 与已写 facts 恢复同一请求；恢复 SHALL 仅追加缺失事实，并最终追加单个可观察的 accepted 终态。

#### Scenario: 部分事实写入后重启
- **WHEN** intent 已保存且同一 operationId 的部分输出 facts 已存在
- **THEN** 重试 SHALL 复用已有事实、补齐缺失事实并返回 accepted

### Requirement: 回执必须保留安全审计元数据
终态回执 SHALL 包含 operationId、actionId、状态、expectedRevision、事实引用、时间及调用方提供的结构化审计上下文；审计元数据不得成为授权或本体状态事实源。

#### Scenario: accepted 回执可核对来源
- **WHEN** Action 成功提交并携带 actor、run 与 work item 上下文
- **THEN** 最新 operation 回执 SHALL 保留这些审计字段及已接纳 fact refs

### Requirement: 未支持的 Rule expression 必须显式拒绝
当 Action 引用需要求值的 Rule 而当前 OSDK 没有确定性 evaluator 时，系统 MUST 在写入前返回 `RULE_EVALUATION_UNAVAILABLE`，不得假定规则通过。

#### Scenario: Action 声明 Rule
- **WHEN** 调用方提交包含 ruleIds 的 Action
- **THEN** 系统 MUST 明确拒绝且 facts 与 operations 文件保持不变
