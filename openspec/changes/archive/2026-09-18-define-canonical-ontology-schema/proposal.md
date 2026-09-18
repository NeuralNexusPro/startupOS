# Proposal

## 追溯信息

- epic-id：ONT
- story-id：ONT.1
- task-id：ONT1-T1
- owner：Architecture / Core
- 来源：`docs/specs/epic-ONT/story-ONT.1/README.md`

## Why

项目当前同时存在旧三层本体、Skill 图谱和 ontology-data-store 三套类型，跨模块无法稳定引用同一概念、业务状态、事实和 Action。ONT1-T1 先建立唯一的公共语义模型，供后续存储、迁移、校验、P2 设计和多 Agent 运行时共同消费。

## What Changes

- 在 `packages/core/src/lib/features/ontology/` 定义版本化 canonical ontology 公共类型。
- 保留 `Domain -> Concept -> Instance` 三层外形，并补齐稳定 `conceptId`、业务状态/转换、FactType、Rule、Action、DomainEvent 与 Projection 定义。
- 定义最小的来源引用、事实引用、输入/输出事实、Action 绑定以及 Agent/Skill contract DTO。
- 通过 ontology feature 的 `index.ts` 暴露公共类型和 schema 版本常量。
- 补齐 ONT.1 Story 六份规格和正反类型示例。
- 不实现存储、旧数据迁移、运行时校验、OSDK 执行、Context Projection 或 UI。

## Capabilities

### New Capabilities

- `canonical-ontology-schema`：定义 OriginOS 唯一的版本化业务语义模型和跨模块公共契约 DTO。

### Modified Capabilities

无。

## Impact

- packages：`packages/core`
- public API：`@originos/core/lib/features/ontology`
- persistence：本 Task 不读写数据；后续 ONT.2 负责序列化与存储
- IPC / packaging：无变化
- dependencies：不新增依赖

## 非目标

- 不删除或迁移现有 `packages/core/src/types/ontology.ts` 与 ontology-data-store 类型。
- 不为字段引用、状态迁移或 Action 权限增加运行时校验。
- 不修改 P2、collaboration-runtime、Web 或 Desktop 消费方。

## 依赖

- `AGENTS.md` 三层本体结构和单向依赖规约。
- `docs/specs/epic-ONT/project-semantic-execution-plan.md` 的语义来源与状态分层。

## 上线方案

以新增公共类型和导出方式随 core 发布；现有调用方保持兼容，下游 Story 可逐步改用 canonical 类型。

## 回滚方案

回滚本 Proposal 的类型、导出和文档提交即可；本 Task 不写运行数据，无数据回滚。
