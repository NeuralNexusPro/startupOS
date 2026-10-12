# Changelog - v0.4.7

本版本修复 Windows 覆盖安装和应用内更新后桌面、开始菜单快捷方式可能丢失的问题。

## 2026-10-10 — fix：Windows 更新后保留并重建快捷方式

**类型**：fix

**影响模块**：Desktop Windows 安装器、自动更新

**摘要**：旧版卸载器返回错误码 2 并进入兼容回退时，继续传递 electron-builder 的快捷方式保留参数；新安装器在全新安装和覆盖升级中都强制创建或修复桌面快捷方式，确保用户更新后仍能正常打开 OriginOS CE。

## 2026-10-12 — fix：协作 Agent 子进程命令超时可经环境变量配置（紧急修复）

**类型**：fix

**影响模块**：packages/core/src/modules/collaboration-runtime/sandbox/agent-spawner.ts

**摘要**：Supervisor/Worker 子进程命令与就绪等待超时原为硬编码 300s；glm 等慢 LLM 端点的 Supervisor 单轮实测可达 895s，超时导致 DAG 在子进程仍在推进时被判定失败（用户 E2E 会话 cs-1791788502557-o3ieuv 复现）。新增 `COLLAB_COMMAND_TIMEOUT_MS` 环境变量覆盖 prompt/resume/waitForReady/sendCommand 四处等待，默认值保持 300s 不变。经用户批准作为 Story 9.44 E2E 期间紧急修复实施（AGENTS.md 紧急变更），随 `proposal/add-collaboration-task-board` 分支落地（commit 3bbb2c1）。

## 2026-10-12 — fix：协作会话 DAG 结束后销毁 supervisor 子进程（紧急修复）

**类型**：fix

**影响模块**：packages/core/src/modules/collaboration-runtime/engine/supervisor-dag.ts

**摘要**：DAG 结束（完成/失败/超时）后 ProtocolObserver 已 close，onSupervisorEvent 丢弃全部后续事件，但 supervisor 子进程仍存活——用户续发消息被 hitl-dispatcher 转发给这个「失聪」进程，回复不落库、UI 停更、会话记录冻结在 running，重启新 DAG 的设计分支永远不可达（用户会话 cs-1791793795138-ekgj6u 复现）。修复：dag.done 后立即销毁 supervisor 子进程，使后续消息按既有设计落入「supervisor 不存活 → 启动新 DAG」分支。abort 路径原本即销毁，不受影响。经用户批准作为 Story 9.44 E2E 期间紧急修复（AGENTS.md 紧急变更），commit 06648f6。

## 2026-10-12 — feat：Story 9.44 多Agent协作统一任务看板合并（Proposal add-collaboration-task-board）

**类型**：feat
**影响模块**：`packages/core/src/modules/collaboration-runtime/ui/`、`packages/core/src/modules/collaboration-runtime/facade/`、`packages/core/src/lib/integrations/electron/`、`packages/desktop/src/main/services/`
**摘要**：Story 9.44 收尾合并（merge `d83d66b`）：协作窗口新增统一任务看板（`TaskBoard`，六类 `TASK_*` 事件实时派生 + 折叠汇总条），新增 `COLLAB_SNAPSHOT_GET` IPC 双通道快照恢复（活跃任务 + 各 Agent 最近终端任务），HITL 请求转发系统通知（幂等、失败不冒泡）。随 Proposal 落地两项紧急修复（见上）。手动 E2E 场景 1 已验证，Multica 卡片式视觉重构另立 Story。
