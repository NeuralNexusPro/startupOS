# 开发文档 - Story OS.19

**Story:** Skill、Agent 与 RoleAgent 目录导出 ZIP
**版本:** 1.0
**最后更新:** 2026-07-26

## 开发目标

建立三类入口共用的安全导出链路，并在窗体头部提供一致的导出按钮。

## 实施步骤

1. 审计现有 workspace 目录映射、IPC channel、preload 类型和窗体头部结构。
2. 提取/复用 Skill、Agent、RoleAgent 的统一目录解析器。
3. 增加异步 ZIP 服务，完成临时文件、原子替换和失败清理。
4. 注册 IPC handler，并通过 preload 暴露最小类型化 API。
5. 创建共享导出图标按钮，接入 `SkillDialog` 和 `AgentDialogContent`。
6. 增加服务单测、IPC 集成测试和 UI 组件测试。
7. 运行目标测试、TypeScript build、`pnpm lint` 和架构检查。

## 文件级改动范围

- `packages/desktop/src/main/services/`：目录解析、导出服务及测试。
- `packages/desktop/src/main/`：IPC channel/handler、preload API 与类型。
- `packages/desktop/scripts/verify-*-package.js`：安装包内 `archiver` 和导出服务运行时校验。
- `packages/web/src/components/`：共享导出按钮及三类窗体接入。
- `packages/desktop/package.json` / lockfile：仅在现有依赖不足时加入流式 ZIP 库。
- `docs/specs/epic-OS/story-OS.19/`：实施和测试结果回填。

## 兼容策略

- 不改变现有工作目录位置、技能加载优先级或 Agent 会话逻辑。
- 不改变 ZIP 内文件内容；仅新增同级 ZIP。
- 非 Electron Web 运行保持原行为，不尝试导出。
- Windows、macOS、Linux 均通过 Electron `shell.showItemInFolder` 定位。

## 审查要点

- 不接受 renderer 传入任意路径。
- 不复制 Skill / Agent 路径映射。
- 压缩过程不得同步阻塞主线程。
- 临时文件必须在成功与失败路径清理。
- 三类窗体必须复用同一 UI 组件和 IPC 契约。
- Windows/macOS 包校验必须在缺少 `archiver` 或导出服务文件时失败。
