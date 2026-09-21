# canonical-ontology-store Specification

## Purpose
为 canonical ontology、版本事实、操作回执和运行投影提供唯一的本地文件存储边界，使快照更新可恢复、事件追加可审计，并为后续迁移和 Action 提交提供稳定事实基础。

## Requirements

### Requirement: canonical ontology 使用原子 DataFile 快照
Store SHALL 将 canonical ontology 写入版本化 DataFile JSON，并 MUST 通过同目录临时文件与 rename 原子替换；更新时 SHALL 保留首次 `createdAt`。

#### Scenario: 更新 ontology 快照
- **WHEN** 同一 projectId 再次保存 canonical ontology
- **THEN** 读取 SHALL 返回最新数据、原始 `createdAt` 和更新后的 `updatedAt`，且目录中不遗留临时文件

### Requirement: 版本记录使用 append-only JSONL
Store SHALL 分别追加 facts、operations、projections 和 migrations 记录，不得重写已经完成的历史行。

#### Scenario: 并发追加同一事实流
- **WHEN** 同一 store 实例并发追加多条 fact records
- **THEN** 每条记录 SHALL 恰好形成一条完整 JSONL 行且均可读取

### Requirement: 恢复截断的尾部记录
Store SHALL 忽略仅位于文件末尾的截断 JSONL 记录并返回之前的完整记录；非尾部损坏 MUST 明确失败。

#### Scenario: 进程在最后一次追加中断
- **WHEN** JSONL 末尾包含无法解析的不完整行
- **THEN** 读取 SHALL 返回所有已完成行且不把截断行当作有效记录

#### Scenario: 历史中间行损坏
- **WHEN** 一条无法解析的记录后仍存在完整记录
- **THEN** 读取 MUST 抛出带文件和行号的错误

### Requirement: Date 跨磁盘边界保持语义
Store SHALL 在磁盘使用 ISO 8601 字符串，并在公共读取 API 返回时恢复 canonical model 与记录中的 Date 字段。

#### Scenario: ontology 与 operation 往返
- **WHEN** 调用方写入含 Date 的 ontology 和 operation record 后重新读取
- **THEN** 公共 API 返回的对应字段 SHALL 为等值 Date 对象

### Requirement: 路径与项目隔离
Store MUST 拒绝空 projectId、绝对路径和包含目录分隔或 `..` 的 projectId，且所有文件 SHALL 位于注入 data root 的 `ontology/` 目录。

#### Scenario: 路径遍历输入
- **WHEN** 调用方使用 `../other` 作为 projectId
- **THEN** Store MUST 在文件访问前拒绝请求

### Requirement: 操作回执可按 operationId 定位
Store SHALL 允许追加同一 operationId 的状态记录，并返回该 operationId 最后追加的记录，供后续恢复核对使用。

#### Scenario: intent 后收到 accepted 回执
- **WHEN** 同一 operationId 依次追加 intent 与 accepted
- **THEN** 最新回执查询 SHALL 返回 accepted 记录且历史两行均保留

### Requirement: 迁移可安全删除目标快照
Store SHALL 提供受现有项目路径校验和同文件队列保护的 ontology 快照删除操作，并 SHALL 返回目标是否实际存在。

#### Scenario: 删除迁移新建快照
- **WHEN** 迁移协调器在校验目标版本后删除 ontology
- **THEN** Store SHALL 等待同文件待处理操作、删除目标文件并返回 true

#### Scenario: 目标已不存在
- **WHEN** 删除不存在的 ontology 快照
- **THEN** Store SHALL 返回 false 且不报错
