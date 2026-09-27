## Purpose
使 OriginOS 的方案图谱视图闭环能够在真实产品入口生效，并确保方案、任务与本体状态保持同一语义，通过可重复的成功、失败和恢复场景验证，避免只有孤立实现而无法被用户使用。

## ADDED Requirements
### Requirement: 两种视图可切换
方案图谱 SHALL 提供工作流和团队两个可访问入口，切换不修改方案或发布状态。
#### Scenario: 查看共享技能
- **WHEN** 用户从工作流切换团队视图
- **THEN** 系统 SHALL 显示角色与共享技能关系并保留方案版本
### Requirement: 技能节点与关系可见
图谱 MUST 区分 Agent 与 Skill 节点，并显示调用、输出及原协作关系；缺失引用 SHALL 可见而不是被静默丢弃。
#### Scenario: 两个角色调用同一技能
- **WHEN** 团队中两个 Agent 引用同一 Skill
- **THEN** 图谱 SHALL 显示共享技能及两个调用关系
### Requirement: 契约详情保真
用户选择技能时 SHALL 看到输入输出及其完整本体版本引用；旧格式只能作为兼容信息展示。
#### Scenario: 查看 canonical 技能
- **WHEN** 用户点击带 canonical contract 的技能
- **THEN** 详情 SHALL 显示 FactType、本体版本、Action 和权限
### Requirement: 切换响应有界
支持的方案规模下视图切换 MUST 在 5 秒以内完成，并支持键盘操作。
#### Scenario: 切换常规方案
- **WHEN** 用户通过键盘切换包含多个 Agent 和共享 Skill 的方案
- **THEN** 活跃标签和图内容 SHALL 更新且耗时小于 5 秒
