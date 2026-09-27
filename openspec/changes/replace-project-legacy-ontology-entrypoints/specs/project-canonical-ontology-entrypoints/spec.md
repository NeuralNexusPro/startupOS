# Spec Delta

## Purpose

让新项目从访谈确认到编辑和 Agent 运行均使用同一份 canonical ontology，并让旧项目在显式迁移前保持安全的兼容读取行为。

## ADDED Requirements

### Requirement: 新项目创建 canonical ontology

系统 SHALL 在新项目访谈确认时生成、校验并原子写入该项目的 canonical ontology。项目元数据 MUST 保存精确的 ontology ID 与版本，且不得同时生成或更新 `business-model.json` 作为事实源。

#### Scenario: 访谈确认创建项目

- **WHEN** 用户确认完整的新项目访谈结果
- **THEN** 系统写入一个通过 canonical 校验的项目本体，并返回项目及其精确 ontology ID/version

#### Scenario: 本体写入失败

- **WHEN** 访谈结果无法转换或 canonical 校验失败
- **THEN** 系统 MUST 不创建部分项目事实，并返回可定位的结构化错误

### Requirement: 项目入口读取 canonical ontology

项目 Agent 启动上下文、方案入口和项目本体编辑器 SHALL 经 ontology feature 的公共 API 读取 canonical ontology。它们 MUST 不在读取或页面加载期间从 `business-model.json` 自动同步、写入或覆盖 canonical ontology。

#### Scenario: 已本体化项目打开编辑器

- **WHEN** 用户打开具有有效 canonical ontology 的项目
- **THEN** 编辑器和项目 Agent 使用该 ontology ID/version 的数据，并且不写入 legacy 文件

#### Scenario: canonical ontology 缺失

- **WHEN** 旧项目尚未完成显式迁移
- **THEN** 系统显示明确的迁移或兼容读取状态，且不得自动创建 canonical ontology

### Requirement: 旧项目显式迁移与只读兼容

系统 SHALL 仅通过既有显式迁移入口将 `business-model.json`、`OntologyModel` 或旧 Ontology 转换为 canonical ontology。兼容视图 MUST 是只读投影，且项目入口不得把该投影写回任何 canonical 或 legacy 文件。

#### Scenario: 打开未迁移旧项目

- **WHEN** 用户打开只有 legacy 业务模型的项目
- **THEN** 系统保留原文件并提示可执行的显式迁移，不产生迁移记录或新 canonical 快照

#### Scenario: 用户完成显式迁移

- **WHEN** 用户在 dry-run 通过后确认迁移
- **THEN** 系统遵守备份、审计、拒绝覆盖和回滚要求，并在后续入口读取 canonical ontology

### Requirement: 跨端入口语义一致

Web API 与 Desktop IPC SHALL 对项目本体读取、迁移状态和失败结果返回等价的业务语义。边界层 MUST 不复制本体转换、校验或存储逻辑。

#### Scenario: 两端读取缺失本体的项目

- **WHEN** Web 与 Desktop 请求同一个未迁移项目的本体状态
- **THEN** 两端返回相同的结构化迁移状态，且不泄露绝对路径、文件正文或凭据
