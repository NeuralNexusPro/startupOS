# 架构设计文档 - Story 0.7

**Story:** Pi Runtime 0.80.x 升级与 pi-agent-goal 兼容迁移  
**版本:** 1.0  
**最后更新:** 2026-07-28

---

## 设计目标

将上游 Pi Runtime 的包名和 API 变化封装在 OriginOS 集成边界内，
避免业务 Feature、Web 组件和 Electron 主进程直接依赖易变的上游实现。

## 版本兼容矩阵

| 组件 | 当前版本 | 目标版本 | 约束 |
|------|---------|---------|------|
| pi-agent-core | `@mariozechner/*@0.55.3` | `@earendil-works/pi-agent-core@0.80.10` | 精确锁定 |
| pi-ai | `@mariozechner/*@0.55.3` | `@earendil-works/pi-ai@0.80.10` | 与 core 对齐 |
| pi-coding-agent | 旧包或间接依赖 | `@earendil-works/pi-coding-agent@0.80.10` | Goal peer 范围 `<0.81.0` |
| pi-tui | 无统一基线 | `@earendil-works/pi-tui@0.80.10` | Goal peer 范围 `<0.81.0` |
| pi-agent-goal | 未正式接入 | `pi-agent-goal@2026.7.18` | 最小生命周期验证 |
| Node.js | 环境不统一 | `>=22.19.0` | 本地和 CI 一致 |

## 目标依赖结构

```text
packages/desktop 与 packages/web
                |
                v
packages/core 公共 Pi 集成 API
                |
                v
@originos/pi-agent-adapter
       |        |         |
       v        v         v
 pi-agent   pi-ai   pi-coding-agent/pi-tui
                |
                v
          pi-agent-goal
```

`pi-agent-goal` 由 Core 的 Node-only Pi 集成边界提供注册函数。该入口不从
浏览器可达的公共 barrel 导出，产品入口启用时必须由服务端或 Electron 主进程
显式导入；它不能反向依赖 Web UI、Desktop main service 或业务 Feature。

## 模块职责

### `packages/agent`

- 作为 OriginOS 自有适配包，建议重命名为 `@originos/pi-agent-adapter`。
- 统一导出 OriginOS 使用的 Agent、事件、工具和消息类型。
- 封装 ESM/CJS 互操作和上游 API 差异。
- 不包含业务路由、会话存储或 UI 逻辑。

### `packages/core/src/lib/integrations/pi-agent/`

- 消费适配包公共 API。
- 维护模型、工具、事件、Agent 类型和扩展生命周期的 OriginOS 语义。
- 提供 `pi-agent-goal` 的 Node-only 注册边界，并由后续产品入口接入现有诊断通道。
- 浏览器安全能力继续通过现有 `index.ts` 暴露，Goal 注册器不进入该 barrel。

### `packages/desktop`

- 只负责 Electron 生命周期、IPC 和最终包验证。
- 不复制 Core 的 Pi 适配逻辑。
- 更新包校验脚本以检查目标依赖真实布局。

### `packages/web`

- 继续通过 Core hooks/services 消费流式事件。
- 不直接依赖 Goal 扩展或 Pi Agent 核心实现。

## 适配契约

适配层至少稳定以下能力：

```typescript
export type {
  AgentEvent,
  AgentMessage,
  AgentTool,
  AssistantMessage,
  ToolResultMessage,
};

export {
  Agent,
  createRuntimeModel,
  streamRuntimeResponse,
};
```

最终名称以 0.80.10 实际 API 为准，但 Core 以上模块不得感知上游包名。
类型不兼容必须显式转换，禁止用 `any` 或双重断言绕过。

## 迁移阶段

1. 记录 0.55.3 的测试、事件和打包基线。
2. 更新 Node/CI 基线并安装精确版本。
3. 将 workspace facade 改为 OriginOS 包名并替换生产导入。
4. 按模型、消息、事件、工具、Agent 生命周期分类修复 API 差异。
5. 注册 Goal 扩展并完成最小生命周期测试。
6. 执行 Web、Core、Desktop 回归和跨平台打包验证。
7. 更新变更记录和回滚说明。

## ESM、Electron 与打包策略

- 先检查 0.80.10 的 `exports`、模块格式和动态导入要求，再决定适配层输出格式。
- Electron 主进程不得直接 `require` 仅支持 ESM 的上游入口。
- electron-builder 的 `files`、`asarUnpack` 和 pnpm 依赖布局必须由最终产物验证。
- Windows 与 macOS 各架构必须独立检查，不以源码目录存在模块代替包内验证。
- 验证脚本不得硬编码已移除的旧包路径。

## Goal 扩展边界

本 Story 只提供：

- 扩展可发现和可装载。
- Goal 创建、读取、进度更新、完成、重载。
- 结构化错误与持久化兼容测试。

任务入口、Workflow/Ultracode 模式、阶段计划、检查点和多 Agent 编排由后续
Story 9.41 设计和实现。

## 性能与可靠性

- 适配层事件转换为 O(1) 单事件处理，不复制完整会话历史。
- 不在 Electron 主线程增加同步磁盘操作。
- Goal 状态持久化沿用本地文件存储边界，不引入数据库。
- 扩展异常不能阻止 `agent_end`、IPC 最终事件或用户错误反馈。

## 安全

- 不记录模型凭证或 Goal 内容中的敏感值。
- 工具权限仍由 OriginOS scope 和 allowlist 控制。
- Goal 扩展不能绕过现有工作目录和文件访问边界。

## 影响文件

- `package.json`、`pnpm-lock.yaml`、workspace 配置和 CI workflow。
- `packages/agent/package.json`、`index.js`、`index.d.ts` 及必要的适配源码。
- `packages/core/src/lib/integrations/pi-agent/` 内生产代码、类型、mock 和测试。
- `packages/desktop/package.json`、打包配置与模块校验脚本。
- `packages/web/package.json` 及 Pi 集成相关测试配置。

## AGENTS.md 符合性

- Core 集成层不依赖 Web 或 Desktop，符合单向依赖。
- Web 和 Desktop 只消费 Core 公共 API。
- 不在 `app/` 中加入业务逻辑。
- 不引入数据库、Redux、CSS Modules 或同步主线程任务。
- 修改源码和构建脚本，不把 `dist-electron` 作为实现入口。
