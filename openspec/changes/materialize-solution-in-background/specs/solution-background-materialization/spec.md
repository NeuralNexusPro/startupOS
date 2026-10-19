# Spec Delta

## Purpose

为已确认的解决方案提供可断点恢复、可审计且不进入项目任务看板的后台 Agent/Skill 文件物化能力，避免单轮对话批量写文件造成半成品和整批失败。

## ADDED Requirements

### Requirement: 已确认方案启动内部后台物化任务
系统 SHALL 只使用同一项目、同一方案版本且状态为 confirmed 的 manifest、agents、skills 三份文件启动物化任务，并冻结输入摘要。

#### Scenario: 方案输入有效
- **WHEN** 三份 confirmed 文件的 project、solutionVersion 和契约引用一致
- **THEN** 系统创建唯一后台物化任务并立即返回任务摘要

#### Scenario: 方案输入不完整
- **WHEN** 任一文件缺失、状态不一致或契约引用无效
- **THEN** 系统拒绝启动且不创建 Agent/Skill 文件

### Requirement: 物化步骤可独立恢复
系统 SHALL 为每个 Agent、每个 Skill 和最终验证保存独立步骤状态、尝试次数、错误原因及产物路径，并 MUST 保证同一输入重复执行是幂等的。

#### Scenario: 中途退出后恢复
- **WHEN** 应用在部分步骤完成后退出并重新启动
- **THEN** 系统保留已验证步骤并从第一个未完成或可重试步骤继续

#### Scenario: 单个 Skill 失败
- **WHEN** 一个 Skill 生成或校验失败
- **THEN** 系统记录该步骤的具体原因且不重新生成已完成的 Agent 和其他 Skill

### Requirement: Skill 产物遵循创建器契约
系统 SHALL 使用项目内 `project-skill-creator` 的方案模式约束生成 Skill，并 SHALL 确保 SKILL.md 声明的本体工具参考在产物目录中真实可达。

#### Scenario: Skill 生成成功
- **WHEN** Skill contract、outline 和所属 Agent 均有效
- **THEN** 产物包含通过 contract 一致性校验的 SKILL.md 及其所引用的必要 references

### Requirement: 后台任务不进入项目任务看板
系统 MUST 将物化任务与业务 Task、Run、WorkItem 隔离，不得投影到项目任务看板或协同图。

#### Scenario: 查询项目任务看板
- **WHEN** 后台物化任务正在运行或失败
- **THEN** 项目任务看板的任务集合保持不变

### Requirement: 完成前执行确定性验收
系统 SHALL 在全部文件步骤完成后校验文件完整性、Agent 技能引用、Skill contract 与 skills.json 一致性，并仅在全部通过后标记任务完成。

#### Scenario: 验收通过
- **WHEN** 所有确定性检查通过
- **THEN** 系统将任务标记为 completed 并记录最终产物清单

#### Scenario: 验收失败
- **WHEN** 任一文件缺失、引用失效或 contract 不一致
- **THEN** 系统将验证步骤标记为 failed，并保留可恢复状态和具体诊断
