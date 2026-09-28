# 需求文档 - Story 0.7

**Story:** Pi Runtime 0.80.x 升级与 pi-agent-goal 兼容迁移  
**版本:** 1.0  
**最后更新:** 2026-07-28

---

## 需求来源

当前仓库使用已弃用的 `@mariozechner/pi-agent-core@0.55.3` 和
`@mariozechner/pi-ai@0.55.3`。上游已迁移到 `@earendil-works/*`，
而计划采用的 `pi-agent-goal@2026.7.18` 要求
`@earendil-works/pi-coding-agent >=0.80.5 <0.81.0` 和
`@earendil-works/pi-tui >=0.79.3 <0.81.0`。

本 Story 选择全套 `0.80.10` 作为唯一兼容基线。最新的 0.82.x
不满足当前 Goal 扩展的 peer dependency，不能直接采用。

## 功能需求

### FR1: 统一运行时版本

- `pi-agent-core`、`pi-ai`、`pi-coding-agent` 和 `pi-tui` 使用
  `@earendil-works/*@0.80.10` 精确版本。
- `pi-agent-goal` 使用 `2026.7.18` 精确版本。
- 仅在扩展运行时确有需要时引入 `typebox`，版本必须与上游解析结果一致。
- 根包、workspace 包、桌面包、Web 包和锁文件不得形成两套 Pi Runtime。
- 本地开发和 CI 的 Node.js 版本必须满足 `>=22.19.0`。

### FR2: 建立 OriginOS 适配边界

- 将 `packages/agent` 明确为 OriginOS 自有 Pi 适配包，建议包名
  `@originos/pi-agent-adapter`。
- Core 业务代码通过该适配包使用 Agent 核心类型和生命周期能力。
- `pi-ai`、`pi-coding-agent`、`pi-tui` 和 Goal 扩展的直接引用只允许出现在
  `packages/core/src/lib/integrations/pi-agent/` 或适配包内部。
- 清理旧包的 ambient declaration、测试 mock 和生产导入，不得用 `any`
  掩盖升级产生的类型差异。

### FR3: 保持现有 Agent 行为

迁移后必须保持以下契约：

- Agent 初始化、`prompt`、`steer`、`followUp`、`abort` 和订阅生命周期。
- `agent_start`、`turn_start`、消息增量、工具调用、`turn_end`、`agent_end`
  等事件的语义和前端消费顺序。
- Tool schema、参数校验、执行结果、异常结果和流式回调。
- 模型注册、凭证传递、`streamSimple` 调用和 provider 适配。
- Completion Guard、RoleAgent、Project Agent、认知钩子与会话持久化。
- Windows 和 macOS 开发态及打包态的模块加载。

### FR4: pi-agent-goal 兼容准入

- Goal 扩展必须能在 OriginOS Pi 集成层装载，不依赖 Web 或 Desktop 上层实现。
- 最小验证覆盖 Goal 创建、读取、进度更新、完成和重新加载。
- 扩展失败必须返回结构化错误并记录实际原因，不能静默终止 Agent。
- 本 Story 只提供扩展装载与兼容能力，产品入口由 Story 9.41 实现。

### FR5: 可复现构建

- `pnpm install --frozen-lockfile` 在 Linux、Windows 和 macOS CI 中通过。
- 桌面开发态不得出现缺包、ESM/CJS 互操作或导出路径错误。
- Windows 和 macOS 安装包必须执行 ASAR/资源模块解析烟雾测试。
- 打包验证脚本必须检查升级后的真实模块路径，不能保留旧包硬编码。

### FR6: 可诊断与可回滚

- 上游 API 不兼容、扩展 peer mismatch、模块解析失败必须输出包名、版本和阶段。
- 升级提交必须保持依赖变更与业务行为改动可区分。
- 若跨平台打包未通过，禁止发布并可回退到升级前锁文件和适配层。

## 验收标准

### AC1: 依赖一致

**Given** 仓库已完成依赖迁移  
**When** 执行 frozen install 和依赖审计  
**Then** 安装成功，生产依赖只解析到 Earendil Works Pi 0.80.10  
**And** 不存在旧 Mario Zechner Pi Runtime 或不兼容的 0.82.x。

### AC2: Agent 核心回归

**Given** 使用受控测试模型和测试工具  
**When** 执行一次文本流、一次成功工具调用、一次失败工具调用和一次中止  
**Then** 事件顺序、状态、工具结果和最终消息符合现有契约  
**And** 失败原因对 UI 与日志均可见。

### AC3: 会话与 Agent 类型兼容

**Given** 已有普通 Agent、RoleAgent 和 Project Agent 会话样例  
**When** 在新 Runtime 中启动、保存并恢复会话  
**Then** 上下文、消息、工作目录、记忆钩子和工具范围保持正确。

### AC4: Goal 扩展兼容

**Given** 已装载 `pi-agent-goal@2026.7.18`  
**When** 创建 Goal、更新进度、完成并从磁盘重新加载  
**Then** Goal 状态一致且扩展无 peer dependency 或 API 错误。

### AC5: Windows 包验证

**Given** Windows CI 构建出的安装包或 unpacked 包  
**When** 运行包校验和启动烟雾测试  
**Then** Pi Runtime、适配包和 Goal 扩展均可解析  
**And** 不出现 `Cannot find module`。

### AC6: macOS 包验证

**Given** macOS arm64 与 x64 构建产物  
**When** 运行包校验和启动烟雾测试  
**Then** Pi Runtime、适配包和 Goal 扩展均可解析  
**And** ASAR 内外依赖布局符合 electron-builder 配置。

## 边界与异常场景

| 场景 | 预期处理 |
|------|---------|
| Node.js 低于 22.19 | 安装或预检明确失败并提示最低版本 |
| Goal 扩展 peer mismatch | CI 依赖审计失败，禁止打包 |
| 上游事件字段变化 | 由适配层转换并由契约测试锁定 |
| ESM 包被 CommonJS `require` | 适配层采用受支持的导入方式，打包烟雾测试覆盖 |
| TypeBox 版本产生重复 schema runtime | 锁文件审计和 schema 测试失败 |
| Windows ASAR 路径与 pnpm 符号链接差异 | 包校验脚本必须读取最终产物验证 |
| macOS 架构包缺少依赖 | arm64/x64 分别验证，任一失败均阻断发布 |
| Goal 状态文件损坏 | 返回结构化错误，不破坏 Agent 会话文件 |

## 依赖关系

| 类型 | 项目 | 状态/影响 |
|------|------|-----------|
| 前置 | Story 0.1-0.6 | 已完成，提供现有运行时行为基线 |
| 外部 | `@earendil-works/*@0.80.10` | 必须精确锁定 |
| 外部 | `pi-agent-goal@2026.7.18` | 决定 Pi 版本上限 |
| 后续 | Story 9.41 | 依赖 Goal 扩展兼容能力 |

## 非功能需求

- 核心运行时业务逻辑测试覆盖率不低于 80%。
- Agent 首个流式事件转发不得因适配层增加超过 50ms 的本地处理延迟。
- 不新增同步文件或进程操作到 Electron 主线程。
- 所有生产 TypeScript 继续使用严格类型，禁止新增 `any`。
- 不改变用户数据格式；如上游消息结构变化，由适配层完成转换。
