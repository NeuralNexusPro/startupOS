# 修复当前架构检查发现的 34 处违规

- epic-id: AG
- story-id: AG.2
- task-id: AG2-T1
- owner: 架构治理维护者（实施由隔离 Task worktree 的 subagents 承担）
- 来源: docs/specs/epic-AG/story-AG.2/README.md
- 基线: dev b2d6bdb；docs/specs/epic-AG/story-AG.5/lint-baseline.md
- 状态: 待审查批准；用户已请求处理违规，本提案尚未获得专项批准。

## Why

AG.5 的真实目录边界检查发现 34 处存量违规：33 处 Core 基础设施反向依赖业务层、1 处通用聊天 UI 依赖业务 UI。修复这些依赖，使既有围栏能作为通过的回归门禁，并保持 Agent、记忆、工具与桌面运行行为。

## What Changes

- 将 IPC 数据契约、跨层记忆类型、Markdown 解析函数和通用权限常量移到合适的底层公共位置，维持单一实现。
- 将用户配置文件读写与业务默认值分离，基础设施使用存储层读取配置。
- 把记忆所有权策略、认知提供者组装、业务工具组装放在共享业务层；底层运行时通过明确传入的函数或已有依赖入口获得能力。
- 更新 Web、Desktop、Agent worker 的实际组装入口和打包路径，避免只在开发态可用。
- 将 ToolExecutionFrame 移入通用聊天组件目录，更新调用方。
- 更新 AG.2 过时目录、依赖规则和验收用例；运行原检查规则、相关行为回归与构建验证。

## Capabilities

### New Capabilities

- `agent-business-boundaries`: Agent 基础设施、业务组装和通用聊天 UI 的单向依赖，及调整后的运行行为兼容要求。

### Modified Capabilities

无。既有 `monorepo-boundary-lint` 的规则和扫描能力保持原样。

## Impact

- packages: core、web、desktop；agent 与 service 的调用方按真实引用链调整。
- public APIs: 公共 DTO 字段、工具名、会话操作和 IPC 消息语义保持兼容；内部 import 及组装入口可能迁移，仓库内调用方必须同步更新。禁止在基础设施中重导出上层业务以伪装兼容。
- persistence: 不迁移用户数据，不修改 JSON/JSONL、Memory.md、认知快照及版本格式；保持所有权隔离和启动时 Frozen Snapshot。
- IPC/platform packaging: 校验 Electron 主进程和 worker 的开发及打包加载路径，业务工具完整注册。
- dependencies: 无新增运行时依赖；基于 AG.5 已落地的检查器及当前 dev。AG.1 历史清场不作为本次人为前置任务。

## 非目标

不重写整个 Pi Agent，不引入通用依赖注入容器，不增加新业务能力；不将无业务职责变化的完整目录改名后逃避检查；不放宽规则、不排除类型导入、不增加存量白名单。不宣称由本次 34 处清零证明全仓循环依赖与所有 feature 公共 API 均已合规。

## 上线与回滚

批准后在独立 Task worktree 实施；完成集成、Story 验证 goal、strict validation 后合并到 dev。通过项目既有构建方式生成本地测试产物。失败时修复阻塞项，不合并不完整交付；合并后可回退该 Proposal 的代码与文档提交，无数据回滚步骤。
