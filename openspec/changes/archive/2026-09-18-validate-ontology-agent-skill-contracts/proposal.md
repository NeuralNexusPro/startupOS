# Proposal

## Why

ONT.1 已定义 Agent/Skill 语义契约，ONT.4 已能校验本体与 Action，但 P2 仍无法判断单个契约是否引用合法，也无法在发布前识别 SOP 必需输入断流。ONT6-T1 需要提供一个确定、无副作用的公共校验 API，让错误在生成执行契约前被结构化拒绝。

## What Changes

- 新增 Agent/Skill contract validator，校验 ontology identity/version、FactType/Concept、Action binding、重复声明和权限覆盖。
- 新增最小 contract flow DTO 与 validator，校验节点/边引用、边的生产者输出与消费者输入兼容，以及必需输入是否由上游或外部输入提供。
- 所有失败返回稳定 code/path 的 `CanonicalValidationResult`；相同输入结果顺序稳定且不修改输入。
- 补齐 ONT.6 Story 六文件、Epic 状态、公共架构边界和验证证据。

非目标：P2 方案编排/发布、DAG 环检测、Agent 调度、运行时 facts 查询、自动插入转换节点、UI/IPC、文件持久化或新依赖。

## Capabilities

### New Capabilities

- `ontology-contract-validation`: 定义 Agent/Skill 语义契约与 SOP facts 连通性的结构化校验行为。

### Modified Capabilities

无。

## Impact

- **追溯：** epic-id `ONT`；story-id `ONT.6`；task-id `ONT6-T1`；owner `Architecture / Core`；来源 `docs/specs/epic-ONT/story-ONT.6/`。
- **代码与公共 API：** `packages/core/src/lib/features/ontology/`；新增 flow DTO 与纯函数 validator，不改变现有 DTO 字段。
- **持久化/IPC/打包：** 无变化。
- **依赖：** ONT1-T1、ONT4-T1；仅依赖同 feature 类型与 Validator。
- **上线：** 新增 API 供后续 P2.8 调用。
- **回滚：** 删除新增 validator、flow DTO 与导出；无数据迁移。
