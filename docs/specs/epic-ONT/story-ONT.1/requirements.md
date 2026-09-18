# ONT.1 需求

## 功能需求

- FR1：定义独立的 schema version 与 ontology version。
- FR2：定义 `CanonicalDomain`、`CanonicalConcept`、`CanonicalInstance`，字段满足 AGENTS.md 三层结构且扩展值使用 `unknown`。
- FR3：定义 Property、Relation、BusinessState、Transition、FactType、Rule、Action、DomainEvent、Projection。
- FR4：定义来源、ontology、概念和事实的版本化引用。
- FR5：定义 input/output fact、Action binding、Agent/Skill contract 和 validation result DTO。
- FR6：从 ontology feature 公共入口导出，保持旧类型兼容。

## 验收标准

1. **Given** 下游持有 conceptId 和 ontology version，**When** 构造引用，**Then** 不需要依赖显示名称。
2. **Given** Action 有前置与后置业务状态，**When** 构造定义，**Then** 可关联概念、事实与权限。
3. **Given** 现有旧模型调用方，**When** 合入本 Story，**Then** 无需同步修改即可继续编译。

## 非目标

存储、迁移、validator、OSDK 执行、运行时投影和 UI 均不属于 ONT1-T1。
