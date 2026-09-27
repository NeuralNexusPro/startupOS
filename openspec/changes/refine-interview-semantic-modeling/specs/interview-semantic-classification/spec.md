# 访谈概念业务分类与图谱表达

## Purpose

为项目访谈提供访谈概念业务分类与图谱表达的明确行为边界，确保业务用户能理解并确认语义，系统保持唯一权威来源，并在并发、失败和恢复后保留一致、可追踪且不越权的结果。

## ADDED Requirements

### Requirement: 业务分类贯通展示

系统 SHALL 在访谈、图谱、列表和编辑器中一致展示中文业务分类；分类不得改变概念稳定 ID、关系或执行权限。

#### Scenario: 显示不同业务概念
- **WHEN** 访谈识别 SQE、来料检验、8D 报告和验收规范
- **THEN** 它们 SHALL 分别显示业务角色、业务活动、文档和标准，不统一显示“类”

### Requirement: 旧数据显式整理

系统 MUST 对缺失分类的既有概念只读展示待分类，用户确认前不写数据；用户确认的分类不得被自动提取覆盖。

#### Scenario: 打开既有项目
- **WHEN** 用户打开无 semanticKind 的项目
- **THEN** 系统 SHALL 显示待分类，文件字节不变，允许预览建议后明确确认

### Requirement: 补关系与纠错可追踪

系统 SHALL 接受仅补关系和按 ID 修改分类，返回每项结果；无效端点或名称歧义 MUST 显式拒绝，禁止创建占位概念。

#### Scenario: 只补充已知概念之间的关系
- **WHEN** 调用方只提交两个已知概念 ID 之间的合法关系
- **THEN** 系统 SHALL 保存关系并刷新投影，不新增概念，重试不得重复创建关系

#### Scenario: 不存在的端点
- **WHEN** 关系端点不能唯一解析
- **THEN** 系统 MUST 返回字段级错误且不得声称该关系已同步

### Requirement: 并发和重试有边界

系统 MUST 校验 ontology ID/version、expectedRevision、权限及 operationId；冲突不得覆盖已提交修改。

#### Scenario: 并发纠正分类
- **WHEN** 两个请求使用同一 revision 修改概念
- **THEN** 系统 SHALL 接纳至多一个，另一个提示刷新且保留用户输入

### Requirement: 持久化与跨端一致

系统 SHALL 在重启、Web 和 Desktop 往返后保留分类与来源，记忆失败不得回滚权威本体或导致重复节点。

#### Scenario: 记忆更新失败后恢复
- **WHEN** 本体已提交但记忆摘要更新失败
- **THEN** 系统 SHALL 可从权威快照重建摘要，图谱读取已提交分类
