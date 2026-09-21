# Design

## Context

见 `proposal.md`。当前旧三层模型位于 `packages/core/src/types/ontology.ts`，访谈类型位于 ontology feature 的 `types.ts`，ontology-data-store 又维护独立实例类型。ONT.1 只能建立新事实契约，迁移和存储分别留给 ONT.3 与 ONT.2。

## Goals / Non-Goals

**Goals:**
- 在 ontology feature 内建立唯一 canonical TypeScript 模型和版本常量。
- 保留 AGENTS.md 要求的三层结构，并覆盖后续 P2/runtime 所需的最小语义类型。
- 保证旧类型与调用方不受影响。

**Non-Goals:**
- 不做 JSON 序列化、文件存储、迁移或运行时 validator。
- 不定义完整 Context Projection 协议。
- 不修改任何 Web、Desktop、P2 或 collaboration-runtime 调用方。

## Decisions

### 1. 在现有 ontology feature `types.ts` 增加 canonical 类型

公共入口已经 `export * from './types'`，直接复用可避免新建只做转发的模块。替代方案是新增 schema 包或独立 feature；这会增加边界与导出层，当前没有必要。

### 2. 使用 `Canonical*` 名称并保留旧类型

新增 `CanonicalOntology`、`CanonicalDomain`、`CanonicalConcept`、`CanonicalInstance` 等名称，避免与根 `types/ontology.ts` 的旧 `Domain/Concept/Instance` 冲突。旧类型不改动，由 ONT.3 负责显式迁移。

### 3. 内存模型使用 `Date`，持久化格式留给 ONT.2

这满足 AGENTS.md 三层模型约束，也避免在 ONT.1 同时承诺 JSON codec。`schemaVersion` 与 ontology `version` 分开：前者描述结构版本，后者描述项目语义版本。

### 4. ID 保持普通字符串

所有跨模块引用均使用带语义字段名的 `string`，例如 `conceptId`。替代方案是 branded type；它会迫使现有边界增加转换代码，当前收益不足。

### 5. 本 Task 只提供类型，不提供伪 validator

字段、引用和状态转换的运行时验证属于 ONT.4。ONT.1 只用 TypeScript 编译样例验证公共契约，避免产生两套校验规则。

## 数据所有权与依赖

- schema 类型所有者：`packages/core/src/lib/features/ontology/`
- public API：`@originos/core/lib/features/ontology`
- 依赖：仅 TypeScript 类型；不依赖 Web、Desktop、其他 feature 或存储实现
- subagent 写入范围：仅 ontology feature 类型、对应最小测试/类型检查样例；Story/OpenSpec 文档由 proposal integration branch 维护，范围不重叠

## Risks / Trade-offs

- [旧类型继续并存] → ONT.3 提供迁移和只读兼容投影，本 Task 不做隐式转换。
- [`Date` 不能直接作为 JSON 类型] → ONT.2 统一负责序列化，不允许调用方自行发明格式。
- [模型字段过早膨胀] → 仅纳入 Epic 明确要求和首个贯通场景需要的字段，扩展信息放入 `metadata`。

## Migration Plan

1. 先新增公共类型和导出，不切换调用方。
2. 后续 ONT.2/ONT.3 分别实现持久化和旧模型迁移。
3. 回滚时删除新增类型和版本常量；没有数据变更。
