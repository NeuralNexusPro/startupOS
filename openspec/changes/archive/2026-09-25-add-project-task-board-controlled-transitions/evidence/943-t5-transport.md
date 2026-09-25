# 943-T5-C Transport 验收证据

## 契约边界

- cross-package 新增 `transition_project_task` 请求，完整携带 `targetStatus`、`requestId`、`expectedRevision`、可选 `expectedLeaseEpoch` 与 `reason`。
- Core transport 只调用 `ProjectTaskBoardService.requestProjectTaskTransition`；Web route、Desktop IPC 与 Web client 仅校验和转发，不把目标列推断为 runtime/review 命令。
- `REVISION_CONFLICT`、`LEASE_CONFLICT`、`TRANSITION_NOT_AVAILABLE`、`TRANSITION_AMBIGUOUS`、`EVIDENCE_GATE_FAILED` 保持稳定 code；权威 Task 摘要、evidence gap kind/id/message 与可定位 issue 原样跨包传递。
- Desktop 与 Web transport parity 测试验证相同 transition intent 和拒绝响应不会因 transport 改写。

## 定向验证

- Core cross-package service：16 项通过。
- Desktop IPC：14 项通过。
- Web task board service、route、transport parity：23 项通过。
- Core、Web、Desktop TypeScript strict typecheck 通过。
- 目标文件 ESLint、架构边界扫描、自测、OpenSpec strict validation、diff check 通过。
