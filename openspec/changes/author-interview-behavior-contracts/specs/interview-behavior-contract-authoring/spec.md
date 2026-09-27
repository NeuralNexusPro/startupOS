# 访谈业务行为契约草稿与确认

## Purpose

为项目访谈提供访谈业务行为契约草稿与确认的明确行为边界，确保业务用户能理解并确认语义，系统保持唯一权威来源，并在并发、失败和恢复后保留一致、可追踪且不越权的结果。

## ADDED Requirements

### Requirement: 草稿不得直接生效

系统 SHALL 保存带来源和澄清项的行为草稿；未获得可信用户确认或引用不完整时 MUST 不发布正式定义。

#### Scenario: 权限未知
- **WHEN** 访谈识别活动但未明确权限要求
- **THEN** 系统 SHALL 追问并保留草稿，不以空权限发布

### Requirement: 完整定义原子接纳

系统 MUST 对 Action、FactType、业务状态、Transition 和 Rule 的定义批次统一校验并全有或全无提交；批次上限为100条。

#### Scenario: 用户确认完整草稿
- **WHEN** 用户确认当前草稿和本体 revision，所有定义引用完整且拥有编辑权限
- **THEN** 系统 SHALL 一次接纳全部定义、递增一次 authoring revision 并返回唯一回执，草稿随后显示已确认

#### Scenario: 超出批次边界
- **WHEN** 请求包含101条定义命令
- **THEN** 系统 MUST 拒绝整批并提示缩小范围，不得部分写入

#### Scenario: 非法交叉引用
- **WHEN** 批次中任一 Action 引用了不存在的 FactType
- **THEN** 系统 MUST 返回定位问题且所有定义和 revision 均不变

### Requirement: 确认与并发冲突检测

系统 MUST 校验草稿版本和确认摘要、本体身份及 revision、编辑权限；不得用旧确认覆盖新修改。

#### Scenario: 预览后本体发生变化
- **WHEN** 用户确认期间本体 revision 已变
- **THEN** 系统 SHALL 保留草稿、拒绝发布并要求重新审阅

### Requirement: 跨进程重试可恢复

系统 MUST 按 operationId 与命令摘要恢复唯一提交回执，跨进程竞争同一 revision 最多一次成功。

#### Scenario: 提交后崩溃
- **WHEN** 快照保存成功但草稿 published 状态尚未落盘时进程退出
- **THEN** 重试 SHALL 返回原回执并修复草稿状态，不重复写定义

### Requirement: 定义与执行严格区分

系统 SHALL 展示行动的对象、事实、状态、约束和来源；定义已保存 MUST 不等同可执行，未支持的规则求值仍受既有门控拒绝。

#### Scenario: 有规则无求值器
- **WHEN** 已保存行动引用 Rule 且运行环境无 evaluator
- **THEN** 系统 SHALL 展示执行阻塞且不得运行或删除约束

### Requirement: 确认结果供方案精确消费

系统 SHALL 只将确认后的 canonical 定义供 P2 使用，复用公共契约校验，禁止按名称推断输入输出绑定。

#### Scenario: 消费旧版本
- **WHEN** 方案绑定的 ontology version 与当前定义不一致
- **THEN** 系统 MUST 返回版本问题，不自动将引用指向同名对象
