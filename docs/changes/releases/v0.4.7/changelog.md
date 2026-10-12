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
