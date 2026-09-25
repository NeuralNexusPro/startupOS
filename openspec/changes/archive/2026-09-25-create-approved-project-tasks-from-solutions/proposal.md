# Proposal

## Why

Story 9.43 要求从已发布方案/任务模板创建正式 Task。当前看板没有创建入口，9.42 也只能从调用方提供的 contract/binding 启动 Run；手动目标若直接进入 runtime，会绕过 P2.8 设计确认和 ONT 语义门控，无法满足 B03、B14。

**可追溯信息：** Epic 9；Story 9.43；任务 943-T7；Owner：Project Runtime / Solution / Web；依赖：P2.8、9.42；来源：`docs/specs/epic-9/story-9.43/`。

## What Changes

- 新增项目任务创建应用服务，只读取精确 solution/version/contractId 的已发布、完整、未撤销 execution contract。
- 选择 contract 内的 taskTemplate，绑定 canonical semantic object/fact input refs，并在任何写入前验证 ontology/version、required slots、FactType、Action、权限和 verifier。
- 以持久 creation operation 记录 requestId、输入 hash、Task 与 Run/binding 回执；重放恢复同一结果，不重复创建。
- 增加 Desktop IPC/Web service/看板“新建任务”交互；手动目标必须匹配已发布模板，否则显示 DesignGap 并返回方案设计。

## Non-goals

- 不允许 runtime 动态生成未审批 Agent/Skill 拓扑。
- 不从 legacy solution 名称猜测模板、FactType、Action 或权限。
- 不创建第二份 Task 状态；正式 Task 仍由 Task Runtime 持久化，Run 由 9.42 ledger 持有。

## Capabilities

### New Capabilities

- `approved-solution-project-task-creation`: 从已发布方案模板幂等创建正式项目 Task 与 contract-bound Run。

### Modified Capabilities

- 无。

## Impact

影响 Core project feature、跨包 contract/service、Core server composition、Desktop IPC、Web task board service/UI 与测试。存储继续使用 JSON/JSONL operation ledger。
