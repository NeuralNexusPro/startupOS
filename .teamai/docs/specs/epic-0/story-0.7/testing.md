# 测试文档 - Story 0.7

**Story:** Pi Runtime 0.80.x 升级与 pi-agent-goal 兼容迁移  
**版本:** 1.0  
**最后更新:** 2026-07-28

---

## 测试目标

证明 Pi Runtime 升级没有破坏现有 Agent 契约，`pi-agent-goal` 与
0.80.10 基线兼容，并且开发态及跨平台桌面包均可加载真实运行时。

## 覆盖目标

| 层级 | 目标 |
|------|------|
| 核心适配逻辑 | 不低于 80% |
| Pi/Goal 集成点 | 关键契约 100% |
| 桌面打包关键路径 | Windows、macOS arm64、macOS x64 全覆盖 |
| 用户关键流程 | 开发态和安装包烟雾路径 100% |

## 自动化测试用例

### TC-01 依赖与锁文件一致性

- 执行 `pnpm install --frozen-lockfile`。
- 审计依赖树只存在 `@earendil-works/*@0.80.10` 目标 Runtime。
- 断言不存在旧 Mario Zechner Pi Runtime 和 0.82.x。
- 断言 `pi-agent-goal` peer dependencies 全部满足。

覆盖：AC1。

### TC-02 Agent 文本流契约

- 使用确定性 mock 模型返回多段文本 delta。
- 断言事件从 `agent_start` 到 `agent_end` 顺序正确。
- 断言最终 Assistant 消息内容完整且只完成一次。
- 断言适配层不复制或重复完整历史。

覆盖：AC2。

### TC-03 工具成功与失败

- 调用一个成功工具并校验参数、结果和事件。
- 调用一个抛错工具并校验结构化错误、`tool_end` 和最终反馈。
- 断言失败不会静默中止 Agent。

覆盖：AC2。

### TC-04 控制指令

- 分别验证 `steer`、`followUp` 和 `abort`。
- 中止后不得继续发送模型 delta 或保持运行态。
- 后续消息能够在同一会话继续执行。

覆盖：AC2。

### TC-05 Agent 类型回归

- 启动普通 Agent、RoleAgent 和 Project Agent。
- 断言 system prompt 层、工具 scope、工作目录和认知钩子正确。
- 验证 RoleAgent 状态与 Project Agent Frozen Snapshot 未被改变。

覆盖：AC3。

### TC-06 会话持久化

- 保存包含文本、工具成功、工具失败的会话。
- 销毁 Agent 实例并重新加载。
- 断言消息、模型配置、项目/Agent 作用域和工作目录一致。

覆盖：AC3。

### TC-07 Goal 最小生命周期

- 装载 `pi-agent-goal@2026.7.18`。
- 创建 Goal，读取状态，更新进度，标记完成。
- 重建 Runtime 后重新加载并断言最终状态一致。
- 使用损坏状态文件验证结构化失败和会话隔离。

覆盖：AC4。

### TC-08 模块格式与导出

- 在 Node ESM、Node CommonJS 兼容入口和 Electron main 环境加载适配包。
- 断言公共类型对应的运行时导出存在。
- 断言不存在 package exports、dynamic import 或 `require()` 错误。

覆盖：AC1、AC5、AC6。

### TC-09 Windows 最终包

- 构建 Windows x64 unpacked/installer。
- 检查 ASAR 和 unpacked resources 中的适配包、Pi Runtime 和 Goal 扩展。
- 从最终包执行模块解析烟雾测试并启动应用。
- 断言无 `Cannot find module`、pnpm 长路径泄漏或旧包路径。

覆盖：AC5。

### TC-10 macOS 最终包

- 分别构建 arm64 和 x64 产物。
- 检查两个产物的 ASAR/资源依赖。
- 执行模块解析与应用启动烟雾测试。
- 断言两个架构均无缺包和模块格式错误。

覆盖：AC6。

### TC-11 Completion Guard 与错误终态

- 验证计划型未完成 stop 仍按现有策略恢复。
- 验证模型 error、工具 error、Goal error 都产生可见最终状态。
- 断言升级没有改变 Completion Guard 的重试次数和事件语义。

覆盖：AC2、AC4。

### TC-12 架构依赖检查

- 运行 `pnpm lint`。
- 检查 Web/Desktop 未直接导入 Goal 扩展或上游 Agent 核心内部实现。
- 检查 Core 未反向依赖 Web/Desktop。

覆盖：全部架构约束。

## 集成测试矩阵

| 场景 | Linux | Windows | macOS arm64 | macOS x64 |
|------|-------|---------|-------------|-----------|
| Frozen install | 必须 | 必须 | 必须 | 必须 |
| 类型检查与单测 | 必须 | 必须 | 必须 | 必须 |
| Runtime/Goal 集成 | 必须 | 必须 | 必须 | 必须 |
| Electron 包验证 | 可选 | 必须 | 必须 | 必须 |
| 应用启动烟雾 | 开发态 | 必须 | 必须 | 必须 |

## 建议执行命令

实际命令以仓库脚本为准；实施时必须补齐缺失脚本，不能用跳过代替验证。

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm --filter @originos/core test
pnpm --filter @originos/core typecheck
pnpm --filter @originos/desktop test
pnpm --filter @originos/desktop verify:win-package
```

macOS workflow 需要执行对应的 arm64/x64 package verify 命令。

## 人工烟雾测试

1. 执行 `pnpm desktop:dev` 并打开普通 Agent 会话。
2. 验证文本流、工具状态、失败反馈和中止。
3. 打开 RoleAgent 与 Project Agent，确认工作目录和历史恢复。
4. 安装 Windows 包并重复关键流程。
5. 在 macOS arm64/x64 产物上验证启动和首轮 Agent 响应。

## 自动化测试验证 Goal

实现完成后必须创建一个自动化验证 Goal：

> 通过 Story 0.7 定义的测试 case，验证 Pi Runtime 0.80.10、
> pi-agent-goal、现有 Agent 契约及 Windows/macOS 最终包。

该 Goal 必须记录每个 TC 的结果、命令、产物位置和失败原因。
无法自动化的应用签名/公证或真实设备步骤必须列出人工步骤和剩余风险。

## 2026-07-28 验证结果

| TC | 状态 | 证据 |
|----|------|------|
| TC-01 | 通过 | `pnpm install --frozen-lockfile`；依赖树仅包含 Earendil Works `0.80.10` 和 Goal `2026.7.18` |
| TC-02 至 TC-06 | 通过 | Core Pi 定向回归 9 个文件、200 项测试通过；Core/Web/Desktop 类型检查通过 |
| TC-07 | 通过 | `@originos/pi-agent-adapter` 自动创建 Goal，完成读取、更新、完成、重载和损坏状态隔离 |
| TC-08 | 通过（有告警） | CJS/ESM 适配器装载通过；Next 生产构建生成 49 个静态页面并退出 0；Electron 编译通过 |
| TC-09 | 部分通过 | 最新源码重新生成 Windows x64 unpacked/zip，并通过 ASAR、资源和模块 smoke；本机 NSIS 因 Wine `kernel32.dll` 前缀故障未完成 |
| TC-10 | 待验证 | Linux 无法生成 macOS arm64/x64 包，必须由 `desktop-release.yml` macOS runners 验证 |
| TC-11 | 通过 | Completion Guard、模型错误、工具错误和恢复耗尽定向测试通过 |
| TC-12 | 通过 | `pnpm lint` 退出码 0（0 error，2772 条既有 warning）；旧 Runtime 生产导入审计通过 |

关键命令结果：

```text
pnpm --filter @originos/pi-agent-adapter test
  PASS runtime and goal lifecycle
  PASS provider SDK resolution from adapter boundary

pnpm --filter @originos/desktop test
  PASS 8 files / 52 tests

pnpm --filter @originos/desktop verify:win-package
  PASS app.asar module smoke
  PASS unpacked resources
  PASS Windows zip: 3453 entries, longest path 152, no .pnpm paths

CI=1 pnpm exec vitest run <9 个 Pi 契约测试文件>
  PASS 9 files / 200 tests

pnpm --filter @originos/web build
  PASS 49 static pages, exit code 0
```

Web 构建仍报告适配器 CJS bundle 的动态依赖告警，并在静态页面数据收集阶段记录
`node:fs`、`node:os`、`node:path` 的模块探测错误。构建可以完成且产物已生成，
但这些告警需要在后续将服务端 Pi Runtime 与浏览器入口进一步拆分时消除。

Windows 开发态额外验证：

- 清理 WSL 生成的 `node_modules`、`.next/standalone` 和 `dist-electron` 后，
  Windows `esbuild@0.28.1` 可执行文件正常运行。
- `openai`、Anthropic、Google GenAI、Mistral 和 Bedrock SDK 均可从
  `@originos/pi-agent-adapter` 边界加载。
- `desktop:dev` 达到 Next Ready、TypeScript 0 errors 和 Electron main 初始化；
  不再出现 ELF 语法错误、`readlink EINVAL` 或 `Cannot find module 'openai'`。

Core 全量 Vitest 基线另有 135 项失败（1229 项通过），失败集中在：

- 已与当前 `client-hooks.ts` 实现脱节的旧 Hook HTTP mock/初始状态断言。
- collaboration runtime 的 capability/DAG 既有断言。
- 本机缺少 `bubblewrap`、`socat`、`tsx` 的 sandbox/process 测试。
- 两个 React 测试缺少 JSX runtime 配置。

这些失败不位于 Pi 0.80.10 定向契约套件，但在基线修复前不能把“仓库全量
测试通过”作为本 Story 的完成结论。

自动化验证 Goal 由 `packages/agent/scripts/verify-runtime.js` 执行，目标为
`Pass Story 0.7 regression tests`，并验证 Goal 的 active → progress →
complete → reload 生命周期。线程级 Goal 工具当前已有一个暂停中的性能 Goal，
因此未替换该用户 Goal。

剩余人工/平台验证：

1. 在 Windows runner 生成 NSIS installer 并执行安装启动烟雾测试。
2. 在 macOS arm64/x64 runners 构建、签名后运行 `verify:mac-package`。
3. 在真实桌面环境验证普通 Agent、RoleAgent、Project Agent 的首轮消息、
   工具失败反馈、中止与会话恢复。

## 退出条件

- TC-01 至 TC-12 全部通过。
- 无 Critical/High 回归缺陷。
- Windows、macOS arm64、macOS x64 最终包验证通过。
- 自动化测试验证 Goal 完成并可追溯。
- Story 文档和变更记录已更新。
