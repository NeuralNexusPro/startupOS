# Design

## Context

现有 `JsonStore` 直接覆盖文件且路径 API 混用相对/绝对路径；`ontology-data-store` 服务旧项目内实例布局。ONT2-T1 不能改变这些旧调用方，需要新增 canonical store 并为 ONT.3 保留显式迁移边界。

## Goals / Non-Goals

**Goals:** 原子 ontology 快照、四类 append-only JSONL、Date codec、尾部截断恢复、单实例并发安全和操作回执查询。

**Non-Goals:** 旧数据迁移、Action 事务、跨进程锁、压缩/索引、adapter 与 UI。

## Decisions

### 1. 新增 ontology feature store，不修改通用 JsonStore

JsonStore 有大量既有调用方且不理解 canonical Date codec。直接改变它风险更大；canonical store 只服务新公共模型。

### 2. 数据根可注入，默认使用 `getDataRoot()`

构造函数接受 data root，测试使用临时目录，生产复用 core resolver。projectId 使用严格单段文件名校验。

### 3. 快照采用 temp + rename

临时文件与目标文件同目录，避免跨设备 rename。写失败清理临时文件。没有新依赖。

### 4. JSONL 采用单文件 Promise queue

同一 store 实例按文件顺序追加，不同文件并行。跨进程一致性由后续唯一写入宿主负责；本 Task 不用内存锁冒充跨进程保证。

### 5. 只容忍最后一条截断记录

崩溃可能留下尾部半行；中间损坏说明历史不可信，必须报错。空行跳过。

### 6. 显式 Date codec

ontology 的三层时间字段及四类记录时间字段分别转换，避免 JSON reviver 误改 payload 中同名业务字段。

## 数据所有权

- ontology DataFile：canonical schema 快照。
- facts：已接纳事实版本记录。
- operations：意图/回执审计记录；不是 Action 执行器。
- projections：可重建视图记录。
- migrations：后续 ONT.3 的迁移结果记录。

## subagent 写入边界

ontology core subagent 仅修改 ontology types/index、新 store 与定向测试；Proposal owner 维护 Story/OpenSpec。禁止修改旧 ontology-data-store、Web、Desktop 与 collaboration-runtime。

## Risks / Trade-offs

- [无跨进程锁] → 后续 adapter 只允许唯一宿主写入；验收不宣称多进程安全。
- [JSONL 线性读取] → MVP 保持简单；数据量证明确有瓶颈后再增加索引/分页。
- [旧存储并存] → ONT.3 显式迁移，不在读取时静默混合。

## Migration Plan

新增 API 不切换现有数据。回滚代码不会删除文件；旧版本不会主动读取新路径。
