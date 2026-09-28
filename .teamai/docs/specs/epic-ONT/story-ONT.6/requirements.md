# ONT.6 需求

- FR1：Agent/Skill contract ontology identity/version 必须匹配当前本体。
- FR2：input/output FactType 必须存在、Concept 绑定正确且同向不重复。
- FR3：Action binding 必须存在、Concept 正确且权限被 contract 覆盖。
- FR4：flow node ID 唯一，edge 两端节点和 FactType 引用完整。
- FR5：edge FactType 必须同时出现在来源 outputs 与目标 inputs。
- FR6：required input 必须由兼容入边或 externalInputs 提供；optional input 可无来源。
- FR7：结果确定、结构化、无副作用，不修改输入。

非目标：DAG 环检测、调度、自动类型转换、P2 发布、runtime facts、Action/Rule 执行、UI/IPC。
