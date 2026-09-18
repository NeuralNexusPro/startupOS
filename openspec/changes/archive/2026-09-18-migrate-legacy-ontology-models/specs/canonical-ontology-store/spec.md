## ADDED Requirements

### Requirement: 迁移可安全删除目标快照
Store SHALL 提供受现有项目路径校验和同文件队列保护的 ontology 快照删除操作，并 SHALL 返回目标是否实际存在。

#### Scenario: 删除迁移新建快照
- **WHEN** 迁移协调器在校验目标版本后删除 ontology
- **THEN** Store SHALL 等待同文件待处理操作、删除目标文件并返回 true

#### Scenario: 目标已不存在
- **WHEN** 删除不存在的 ontology 快照
- **THEN** Store SHALL 返回 false 且不报错
