# context-projection-protocol Specification

## Purpose
为项目设计与多 Agent 运行时提供同一套语义上下文身份、引用投影和恢复检查点协议，使任务中断后能够定位原契约与输入版本而不复制业务事实。

## Requirements

### Requirement: 唯一标识运行上下文
系统 SHALL 使用 context instance、project、task、session、branch、run、work item 和 attempt 标识共同定位一次执行上下文，并 MUST 绑定 contract id/hash 与 ontology id/version。

#### Scenario: 同一 Agent 执行两个任务
- **WHEN** 同一 Agent 同时处理两个 work item
- **THEN** 两个上下文 SHALL 具有不同的 context/work item/attempt 引用且不能仅靠 agentId 区分

### Requirement: 快照只保存语义引用
context snapshot SHALL 保存对象绑定、输入 fact references、decision references、source references、允许 Action 和 revision；它 MUST 不复制事实正文或成为第二事实源。

#### Scenario: 恢复输入快照
- **WHEN** 运行时重新加载一个 context snapshot
- **THEN** 系统 SHALL 能定位原 ontology、契约、事实和决策版本，并由各自事实源重新读取内容

### Requirement: 投影记录覆盖最小运行语义
projection record SHALL 支持 plan、goal、task、agent、skill、fact、decision、outcome、gap 类型，并携带 context、revision、相关引用和有限 payload。

#### Scenario: 记录一次核验结果
- **WHEN** 运行时追加 outcome projection
- **THEN** 记录 SHALL 指向具体 context 与相关 fact/decision/source references，而不是创建新的业务事实副本

### Requirement: 检查点可定位恢复边界
checkpoint reference SHALL 绑定 context instance、attempt、cursor、revision 和 lease epoch，使恢复方能够识别旧 attempt 与过期执行者。

#### Scenario: 旧执行者提交迟到结果
- **WHEN** checkpoint 的 attempt 或 lease epoch 与当前上下文不一致
- **THEN** 协议 SHALL 暴露该不一致所需的标识，实际拒绝逻辑由运行时门控实现

### Requirement: 公共导出保持纯协议
所有 DTO SHALL 从 ontology feature 公共入口导出，且本能力 MUST 不要求数据库、图数据库、外部服务或新增运行时依赖。

#### Scenario: 下游只导入公共协议
- **WHEN** P2 或 collaboration-runtime 需要声明语义上下文
- **THEN** 它们 SHALL 能从 ontology 公共入口导入类型，无需访问 ontology 内部文件
