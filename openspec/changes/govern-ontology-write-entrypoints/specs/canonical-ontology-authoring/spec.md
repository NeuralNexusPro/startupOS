# Spec Delta: canonical-ontology-authoring

## Purpose

补齐 canonical authoring 的实例层命令，使 Agent 工具与并入脚本能够通过同一受控编辑入口维护 `CanonicalInstance`，无需引入第二条实例写入边界。

## ADDED Requirements

### Requirement: 实例创建必须绑定既有概念
系统 SHALL 支持 `instance.create` 命令创建 `CanonicalInstance`，MUST 校验 `conceptId` 命中当前快照中已存在的概念、实例 `id` 在同版本内唯一、`data` 为对象，并遵循既有 revision CAS、operationId 幂等、权限门控与 validator 全量校验通道。

#### Scenario: 在合法概念下创建实例
- **WHEN** 命令引用的 `conceptId` 存在且实例 `id` 未被占用
- **THEN** 系统 SHALL 将实例追加到快照 `instances` 并返回 accepted 回执

#### Scenario: 引用不存在的概念
- **WHEN** 命令的 `conceptId` 在当前快照中不存在
- **THEN** 系统 MUST 返回结构化校验 issues 且不得修改快照

#### Scenario: 实例 id 重复
- **WHEN** 命令的实例 `id` 已存在于当前快照且 operationId 为新键
- **THEN** 系统 MUST 拒绝命令且不得修改快照

### Requirement: 实例更新不得变更归属概念
系统 SHALL 支持 `instance.update` 命令，patch MUST 仅允许 `data`（整体替换）与可选 `stateId`/`sourceRefs`，`conceptId`、`id`、`createdAt` MUST 不可变；目标实例不存在时 MUST 返回结构化错误。

#### Scenario: 合法数据替换
- **WHEN** patch 仅携带 `data` 或 `stateId`/`sourceRefs`
- **THEN** 系统 SHALL 替换对应字段并更新 `updatedAt`

#### Scenario: 试图移动实例到其他概念
- **WHEN** patch 携带 `conceptId` 或 `createdAt` 键
- **THEN** 系统 MUST 拒绝命令且不得修改快照

### Requirement: 实例删除受关系引用完整性约束
系统 SHALL 支持 `instance.delete` 命令；当任何 `CanonicalInstanceRelation` 仍引用该实例时 MUST 拒绝删除，避免悬空引用。

#### Scenario: 删除无引用实例
- **WHEN** 目标实例未被任何实例关系引用
- **THEN** 系统 SHALL 从快照移除该实例并返回 accepted 回执

#### Scenario: 删除被关系引用的实例
- **WHEN** 存在指向目标实例的 `CanonicalInstanceRelation`
- **THEN** 系统 MUST 返回结构化校验 issues 且不得部分写入
