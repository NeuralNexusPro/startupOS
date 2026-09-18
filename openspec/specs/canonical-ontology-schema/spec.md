# canonical-ontology-schema Specification

## Purpose
为 OriginOS 的项目设计、Agent/Skill 契约和运行时执行提供唯一、版本化且可公开引用的业务语义模型，消除现有多套本体类型之间的语义漂移。

## Requirements

### Requirement: 版本化 canonical ontology
系统 SHALL 提供带 `schemaVersion`、本体版本、项目标识和稳定对象标识的 canonical ontology 公共类型；标识在名称修改后仍保持不变。

#### Scenario: 下游绑定稳定概念
- **WHEN** 下游契约使用 `ontologyId`、ontology version 和 `conceptId` 引用概念
- **THEN** 公共类型 SHALL 能完整表达该引用且不依赖概念显示名称

### Requirement: 保持三层本体兼容外形
canonical model MUST 保留 Domain、Concept、Instance 三层结构要求，并使用 `Record<string, unknown>` 表达扩展属性，禁止在新增公共类型中使用 `any`。

#### Scenario: 表达一个三层业务模型
- **WHEN** 调用方定义一个领域、该领域下的概念及概念实例
- **THEN** canonical 公共类型 SHALL 覆盖 `id`、层级引用、属性或数据以及创建和更新时间

### Requirement: 表达业务状态和可操作语义
canonical model SHALL 表达属性、关系、业务状态、状态转换、FactType、Rule、Action、DomainEvent 和 Projection 定义。

#### Scenario: 定义受状态约束的 Action
- **WHEN** 方案声明某 Action 仅允许对象从指定业务状态迁移到目标状态
- **THEN** 公共类型 SHALL 能引用目标概念、前置状态、后置状态、输入输出事实和权限

### Requirement: 表达来源与事实引用
系统 SHALL 提供最小来源引用、ontology 引用、概念引用和事实引用 DTO，使访谈证据、设计契约及运行时输入能够指向同一语义对象和版本。

#### Scenario: 追踪访谈产生的语义
- **WHEN** 一个概念或契约输入来源于访谈答案
- **THEN** DTO SHALL 能记录来源类型、来源标识以及可选定位信息，而不复制原始正文

### Requirement: 提供 Agent 和 Skill 契约 DTO
系统 SHALL 提供共享的 input fact、output fact、Action binding、Agent contract、Skill contract 和结构化 validation result 类型。

#### Scenario: 下游声明执行契约
- **WHEN** P2 为 Agent 或 Skill 声明输入事实、输出事实和允许的 Action
- **THEN** 公共类型 SHALL 使用 canonical ontology 引用表达所有绑定

### Requirement: 公共导出保持兼容
新增 canonical 类型和 schema 版本常量 SHALL 从 ontology feature 公共入口导出，且 MUST 不删除或改写现有旧本体公共类型。

#### Scenario: 旧调用方继续编译
- **WHEN** 现有调用方继续使用旧 `Ontology`、`OntologyEntity` 或 ontology-data-store 类型
- **THEN** 本变更 SHALL 不要求该调用方同步迁移
