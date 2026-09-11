# 修复 Monorepo 架构检查路径

- epic-id: AG
- story-id: AG.5
- task-id: AG5-T1
- owner: OriginOS 维护者 / Codex
- 来源：`docs/specs/epic-AG/story-AG.5/README.md`
- 状态：2026-09-11 已获用户显式批准；进入实施。

## Why

现有 ESLint zones 使用旧的 `./src` 路径，结果依赖进程工作目录，Core 等包未被默认 lint 覆盖。2026-09-11 在 dev `ad6b2b1` 用 ESLint.lintText 复现：同一 Web service 导入 UI，根目录漏报、Web 目录报告 warning。先修检测器才能建立可信的治理基线。

## What Changes

- 以仓库绝对路径定义现行包边界，显式解析各包 TypeScript 路径。
- 删除已过时的 atoms/organisms 规则，以及禁止 app 导入 core feature 的错误限制。
- 增加独立架构扫描命令和一份使用现有 ESLint API、Node 内置断言的正反例检查。
- 扫描 Web、Core、Desktop、感知插件的生产源码并记录现存违规，保持默认 lint 的兼容级别。

## Capabilities

### New Capabilities

- `monorepo-boundary-lint`：跨工作目录一致、符合现行架构规约的依赖检查与基线。

### Modified Capabilities

无。

## Impact

涉及 `.eslintrc.json` 转为 `.eslintrc.cjs`、根 `package.json` 的检查命令、`scripts/check-architecture-boundaries.cjs`、AG.5 规格与变更记录。复用已安装 ESLint、eslint-plugin-import 和解析器，不新增依赖。公共 API、持久化数据、IPC 和安装包行为不变。

## 非目标

本次不实施整个 AG.5，不新增 knip、依赖注入工厂或架构框架，不迁移业务目录，不批量修复 any，不启用全量循环检查，不宣称完成所有 AG.1–5。跨 feature 公共 API 精确检查与 CI 合并策略留在后续 Task。

## 依赖、上线与回滚

已核对 active changes，本提案不修改 Task Runtime 或感知插件实现。先审查批准，再在独立 subagent Task worktree 实施。合并后运行独立扫描命令输出真实存量；只有完成对应清理后才升级全量强制策略。回滚只需撤销本提案配置、检查脚本和文档提交。
