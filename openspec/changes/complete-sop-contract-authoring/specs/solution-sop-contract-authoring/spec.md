## Purpose
使方案设计者在规划技能和 SOP 时生成与发布链路一致的精确本体输入输出契约，并能够在缺失引用时得到可定位的错误，防止方案设计与运行时使用不同语义模型。

## ADDED Requirements
### Requirement: 新设计必须生成精确语义契约
新设计 SHALL 为 Agent/Skill 生成绑定 ontology ID/version 的 contract，为步骤明确 FactType 输入输出、Action、权限和来源，并在技能创建交接与加载中保留契约。
#### Scenario: 完整设计进入发布
- **WHEN** 已确认设计包含完整合法的本体契约、拓扑与执行策略
- **THEN** 持久化后读取并发布 SHALL 成功且引用保持一致
### Requirement: 缺失数据不可推断
缺失本体引用或必需策略时系统 MUST 提示缺口，不可按名字相似度补全或把旧 I/O 声明当作执行授权。
#### Scenario: 只有旧式对象名
- **WHEN** 旧设计仅声明 objectType 和 fields
- **THEN** 系统 SHALL 保留可读兼容且发布 MUST 返回可定位的语义缺口
### Requirement: 步骤必须通过统一数据流校验
发布前系统 MUST 复用本体公共校验与方案 DAG 检查，拒绝无来源、类型不匹配、版本不一致或循环依赖。
#### Scenario: 上游输出与下游输入不匹配
- **WHEN** 步骤的边引用不同 FactType 或版本
- **THEN** 发布 MUST 被拒绝且不生成执行契约
#### Scenario: 存在依赖环
- **WHEN** 已确认方案中步骤构成闭环
- **THEN** 发布 MUST 返回循环依赖缺口
