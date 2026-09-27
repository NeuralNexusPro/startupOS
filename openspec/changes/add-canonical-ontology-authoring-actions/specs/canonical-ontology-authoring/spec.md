# Spec Delta

## Purpose

为项目本体定义提供唯一的受控编辑入口，使 Web、Desktop 与后续 Agent 工具能够安全修改 canonical ontology，同时保持版本一致、并发可检测、重试幂等和全过程可审计。

## ADDED Requirements

### Requirement: 定义编辑必须绑定权威快照
系统 MUST 要求每个 authoring command 携带 projectId、ontologyId、ontologyVersion、expectedRevision 和 operationId，并在写入前与当前 canonical 快照精确匹配。

#### Scenario: 基于当前快照编辑
- **WHEN** 命令的本体身份、版本和 revision 均匹配当前快照
- **THEN** 系统 SHALL 应用命令并返回递增后的 revision 与权威本体摘要

#### Scenario: 陈旧 revision 编辑
- **WHEN** 命令的 expectedRevision 低于当前快照 revision
- **THEN** 系统 MUST 返回 `REVISION_CONFLICT` 且 canonical 快照保持不变

### Requirement: 定义编辑必须通过统一校验
系统 SHALL 支持领域、概念、属性、关系、业务状态和 Action 的创建、更新与删除，并 MUST 在原子写入前对编辑后的完整本体运行 canonical validator。

#### Scenario: 创建合法概念
- **WHEN** 调用方在现有领域中创建 ID 唯一且引用完整的概念
- **THEN** 系统 SHALL 保存新概念并返回 accepted 回执

#### Scenario: 删除仍被引用的概念
- **WHEN** 删除命令会留下属性、关系、状态、事实类型或 Action 的悬空引用
- **THEN** 系统 MUST 返回结构化校验 issues 且不得部分写入

### Requirement: 定义编辑必须经过权限门控
系统 MUST 要求调用方提供 `ontology:author` 权限；缺少权限的命令不得写入快照或成功回执。

#### Scenario: 无编辑权限
- **WHEN** 调用方未提供 `ontology:author`
- **THEN** 系统 MUST 返回 `PERMISSION_DENIED` 且 revision 不变

### Requirement: operationId 提供幂等与冲突检测
系统 SHALL 保存 authoring command 的稳定摘要与终态回执；相同 operationId 的相同命令重试 MUST 返回既有回执，不同命令复用该 ID MUST 返回 `OPERATION_CONFLICT`。

#### Scenario: accepted 命令重试
- **WHEN** 已成功的命令以相同 operationId 和相同输入再次提交
- **THEN** 系统 SHALL 返回原 accepted 回执且不得再次递增 revision

#### Scenario: operationId 被其他命令复用
- **WHEN** 相同 operationId 携带不同目标或 payload
- **THEN** 系统 MUST 返回 `OPERATION_CONFLICT` 且不得修改快照

### Requirement: legacy 写入口不得恢复
Canonical authoring SHALL 只修改 canonical ontology 快照，不得写入 `business-model.json` 或 legacy `ontology-data-store` schema。

#### Scenario: Desktop 编辑成功
- **WHEN** 用户通过 Desktop 本体编辑器提交合法命令
- **THEN** canonical 快照 SHALL 更新且 legacy 文件内容 MUST 保持不变

