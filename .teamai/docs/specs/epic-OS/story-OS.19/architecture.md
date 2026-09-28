# 架构设计文档 - Story OS.19

**Story:** Skill、Agent 与 RoleAgent 目录导出 ZIP
**版本:** 1.0
**最后更新:** 2026-07-26

## 架构概览

导出是 Electron 桌面能力：Web 组件只提交受限的 `entryType + entryId`；preload 提供类型化 API；主进程统一解析目录、流式创建 ZIP，并调用系统 shell 定位文件。

## 模块与职责

| 层级 | 模块 | 职责 |
|------|------|------|
| Web 组件 | 共享 `ExportEntryButton` | loading、调用 preload、错误反馈 |
| Web 业务组件 | `SkillDialog`、`AgentDialogContent` | 传入入口类型和 ID |
| Electron preload | 类型化导出 API | 只暴露受限 IPC，不暴露任意路径 |
| Electron main service | entry export service | 校验参数、解析目录、压缩、原子替换、定位 |
| Desktop shared helper | entry path resolver | Skill / Agent / RoleAgent 统一目录映射 |

## 依赖方向

```text
Web UI
  -> window.electron API
  -> Electron preload
  -> Electron main IPC
  -> entry export service
  -> Node fs/path + ZIP stream + Electron shell
```

- Web 组件不导入 Electron main 或 Node 文件系统。
- Electron main 不依赖 Web UI。
- 工作目录映射抽成 desktop main 内共享解析器，供 workspace/export 服务共同使用。
- 不向 `packages/web/src/app` 添加业务逻辑。

## IPC 契约

```typescript
type ExportableEntryType = 'skill' | 'agent' | 'role-agent';

interface ExportEntryRequest {
  entryType: ExportableEntryType;
  entryId: string;
}

type ExportEntryResult =
  | { success: true; zipPath: string }
  | { success: false; code: string; error: string; zipPath?: string };
```

渲染进程不能提交源路径或目标路径，避免任意文件读取/写入。

## 文件与原子性

```text
data/skills/example/   -> data/skills/example.zip
data/agents/example/   -> data/agents/example.zip
```

1. 写入同级唯一临时 ZIP。
2. 等待输出流关闭。
3. 删除旧目标 ZIP（如存在）并 rename 临时 ZIP。
4. 调用 `shell.showItemInFolder(targetZip)`。
5. 任意失败均清理临时文件。

## 性能与安全

- 使用流式 ZIP 库，不同步读取整个目录到内存。
- IPC 处理器异步执行。
- ID 仅允许单一目录名，拒绝路径分隔符、绝对路径和 dot segment。
- Skill UI 使用服务返回的 `systemManaged`，主进程复核 `SKILL.md` 的 `originos-system` 元数据；禁止按技能名称硬编码。
- 使用 `path.relative` 再次确认源路径位于允许根目录内。
- 符号链接不跟随到数据根之外。

## AGENTS.md 符合性

- 符合单向依赖：Web -> preload -> desktop main -> Node/Electron。
- 文件系统和 shell 调用仅在 Electron 主进程。
- UI 使用 React、TypeScript、Tailwind 和现有组件库。
- 不修改编译产物，不向 `.claude/skills` 写入。
- 压缩异步流式执行，不阻塞主线程。
