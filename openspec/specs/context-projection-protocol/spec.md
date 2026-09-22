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

### Requirement: 按精确执行上下文查询投影
系统 SHALL 提供类型化 context projection 查询，并 MUST 在读取前校验 project 与 ontology id/version。查询 SHALL 支持按 context instance、task、session、branch、run、work item、attempt、kind 和 revision 过滤，未指定的过滤项不得被隐式猜测。

#### Scenario: 同一 Agent 的两个 work item 保持隔离
- **WHEN** 调用方按一个 work item 和 attempt 查询 projection
- **THEN** 系统 SHALL 只返回完整匹配该 execution identity 的记录，不得返回同一 Agent 的其他任务记录

#### Scenario: ontology 版本不匹配
- **WHEN** 查询携带的 ontology id 或 version 与项目 canonical ontology 不一致
- **THEN** 系统 SHALL 返回结构化错误且不得返回 projection 数据

### Requirement: latest 查询具有确定性
当调用方请求 latest 视图时，系统 SHALL 按 projection `id` 选择最高 revision；同一 `id` 与 revision 重复时 MUST 以 JSONL 中最后追加的记录为准。返回顺序 SHALL 保持所选记录在日志中的顺序。

#### Scenario: 同一 projection 多次修订
- **WHEN** 同一 projection id 存在 revision 1、2 和重复追加的 revision 2
- **THEN** latest 查询 SHALL 返回最后追加的 revision 2 且只返回一次

### Requirement: Resolver 精确解析 fact references
系统 SHALL 能解析一条 projection 的 fact references，并 MUST 要求 project、ontology、concept、fact type、fact id 和 fact version 与 canonical ontology 及已接纳 facts 精确匹配。decision 和 source references SHALL 保持版本化引用，不得被猜测为正文。

#### Scenario: 引用完整且版本一致
- **WHEN** projection 的全部 fact references 都存在且绑定当前 ontology version
- **THEN** resolver SHALL 返回该 projection 与精确匹配的 canonical fact records

#### Scenario: fact reference 缺失或跨版本
- **WHEN** 任一 fact reference 不存在、concept/fact type 归属错误或 ontology version 不一致
- **THEN** resolver SHALL 返回带引用路径的结构化错误且不得返回部分解析结果

### Requirement: 查询与解析保持只读
projection query 与 resolver MUST 不追加 projection、写 facts、执行 Action、修改 checkpoint 或改变运行时状态。

#### Scenario: 查询失败后持久化内容不变
- **WHEN** 查询或解析因非法引用失败
- **THEN** projection 与 facts JSONL 内容 SHALL 保持不变

### Requirement: 公共 API 保持 core 边界
查询 DTO、结果 DTO 与公共方法 SHALL 从 ontology feature 公共入口导出，并 MUST 不要求 Web、Desktop、collaboration-runtime、数据库或新增依赖。

#### Scenario: 下游通过公共入口消费
- **WHEN** 下游模块声明查询并处理结构化结果
- **THEN** 它 SHALL 只需导入 ontology 公共 API，不得访问 feature 内部文件
