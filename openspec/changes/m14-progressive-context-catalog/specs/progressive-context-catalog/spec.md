# Spec Delta

## Purpose

统一所有 Agent 入口的长期知识与经验模式可见性，使模型默认只接收确定、有界的目录，并在确有需要时读取完整内容。

## ADDED Requirements

### Requirement: 默认上下文使用有界认知目录
系统 SHALL 在普通 Agent、RoleAgent、Project Agent 和协作 Agent 启动时只提供 Knowledge 与 Pattern 的有界目录，不得默认注入对应 Markdown 正文。

#### Scenario: 大型认知文件启动
- **WHEN** Agent 的 Knowledge 或 Patterns 文件包含超过目录预算的大量正文
- **THEN** 模型上下文只包含按预算截断的确定性目录和按需读取说明

#### Scenario: 空认知文件
- **WHEN** Knowledge 或 Patterns 文件为空或不存在
- **THEN** 系统不得注入空标题、占位正文或错误信息

### Requirement: 目录输出保持确定性
相同输入文件和预算 SHALL 生成字节一致的目录；不同 Agent 入口 MUST 复用同一目录规则。

#### Scenario: 跨入口相同输入
- **WHEN** 两种 Agent 入口读取相同的标题结构
- **THEN** 它们生成相同顺序和相同预算边界的目录

### Requirement: 完整内容仍可按需读取
系统 SHALL 保留现有受权文件或记忆工具，使 Agent 能在目录不足时读取完整来源。

#### Scenario: Agent 需要模式详情
- **WHEN** Agent 根据目录判断某个模式与任务相关
- **THEN** Agent 可通过已有工具读取该来源且不改变长期存储格式
