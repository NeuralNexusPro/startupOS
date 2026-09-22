# Spec Delta

## ADDED Requirements

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
