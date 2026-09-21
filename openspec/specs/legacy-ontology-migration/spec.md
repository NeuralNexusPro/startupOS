# legacy-ontology-migration Specification

## Purpose
为旧 `Ontology`、访谈 `OntologyModel` 与 `business-model.json` 提供显式、可预览、可回滚的 canonical ontology 迁移边界，并为迁移期读取方保留只读兼容视图。

## Requirements

### Requirement: 三种旧模型可确定性预览
系统 SHALL 支持旧 `Ontology`、访谈 `OntologyModel` 和 `business-model.json` 的显式 source kind，并 SHALL 在相同输入和时间基准下生成相同 canonical ontology 与 diagnostics。

#### Scenario: dry-run 业务模型
- **WHEN** 调用方对合法 `business-model.json` 执行 dry-run
- **THEN** 系统 SHALL 返回带稳定 ID、来源引用、概念、关系和已声明 lifecycle 的 canonical ontology，且不得写入文件

#### Scenario: 输入形状不合法
- **WHEN** 旧数据缺少该 source kind 的必需字段或引用不存在
- **THEN** 系统 MUST 返回带字段路径的错误诊断且不得创建 canonical 快照

### Requirement: 正式迁移先备份且不覆盖
系统 MUST 在写入 canonical ontology 前保存源文件原始字节的备份，并 MUST 拒绝覆盖已有 canonical ontology。

#### Scenario: 首次显式迁移
- **WHEN** dry-run 可通过且目标项目尚无 canonical ontology
- **THEN** 系统 SHALL 创建备份、写入 canonical DataFile，并追加 started 与 completed 迁移记录

#### Scenario: 目标已经存在
- **WHEN** 项目已有 canonical ontology
- **THEN** 系统 MUST 在创建新迁移结果前拒绝请求且不得覆盖目标

### Requirement: 迁移路径受 data root 约束
系统 MUST 只读取注入 data root 内的源文件，并 MUST 使用经过校验的 projectId 生成备份和目标路径。

#### Scenario: 源路径越界
- **WHEN** sourcePath 位于 data root 之外或通过路径遍历逃逸
- **THEN** 系统 MUST 在读取或写入前拒绝迁移

### Requirement: 安全回滚迁移结果
系统 SHALL 允许回滚本次迁移新建且此后未被修改的 canonical 快照，并 SHALL 保留旧源文件、备份和审计记录。

#### Scenario: 回滚未修改的迁移结果
- **WHEN** migrationId 对应的 completed 记录与当前 DataFile `updatedAt` 一致
- **THEN** 系统 SHALL 删除 canonical 快照并追加 rolled_back 记录

#### Scenario: 迁移后数据已修改
- **WHEN** 当前 DataFile `updatedAt` 与迁移完成记录不一致
- **THEN** 系统 MUST 拒绝回滚且不得删除当前快照

### Requirement: 旧格式兼容投影只读
系统 SHALL 从 canonical ontology 生成旧 `Ontology` 和 `OntologyModel` 兼容视图，且 MUST 不提供通过投影覆盖 canonical ontology 的写入通道。

#### Scenario: 旧读取方请求视图
- **WHEN** 调用方投影一个 canonical ontology
- **THEN** 系统 SHALL 返回可序列化的旧 DTO，并仅包含该格式可表达的字段
