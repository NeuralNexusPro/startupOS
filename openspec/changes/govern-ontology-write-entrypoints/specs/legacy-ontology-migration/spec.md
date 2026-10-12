# Spec Delta: legacy-ontology-migration

## Purpose

为已有 canonical 快照的项目定义 legacy 残留数据的显式并入路径，经 canonical authoring 通道补录差集条目，幂等可重跑且 legacy 文件原地保留。

## ADDED Requirements

### Requirement: 残留并入必须显式触发且经 authoring 通道
对已有 canonical 快照的项目，legacy 残留并入 SHALL 由调用方显式触发，且每条补录 MUST 通过 canonical authoring 命令提交（携带 operationId 与指向 legacy 来源的 sourceRefs/审计标注），MUST 不直接写 canonical JSON 或 legacy 文件。

#### Scenario: 显式触发并入
- **WHEN** 调用方对既有 canonical 项目执行残留并入
- **THEN** 新增条目 SHALL 以 authoring accepted 回执落盘且审计记录标注 legacy 来源

#### Scenario: 并入不得触碰 legacy 文件
- **WHEN** 并入执行完成
- **THEN** legacy 目录文件内容与修改时间 MUST 保持不变

### Requirement: 并入必须按稳定键去重且幂等
并入 SHALL 以概念 `name + type`、实例归属概念 + `name/data` 判定键作为去重依据，仅补录差集条目；同一输入重复执行 MUST 产生零新增。

#### Scenario: 重复概念不重复补录
- **WHEN** legacy 残留概念在 canonical 中已存在同名同类型条目
- **THEN** 并入 SHALL 跳过该条目且不得创建重复概念

#### Scenario: 幂等重跑
- **WHEN** 并入成功后以相同输入再次执行
- **THEN** 系统 SHALL 零新增、revision 不变并报告所有条目均为重复

### Requirement: 并入必须先出 dry-run 清单
并入流程 SHALL 提供只读 dry-run，输出将补录与将跳过的条目清单，MUST 不产生任何写入；执行步骤 MUST 在 dry-run 清单经调用方确认后进行。

#### Scenario: dry-run 只预览不写入
- **WHEN** 调用方以 dry-run 模式执行并入
- **THEN** 系统 SHALL 返回补录/跳过清单且 canonical 快照与 authoring JSONL 均无变化
