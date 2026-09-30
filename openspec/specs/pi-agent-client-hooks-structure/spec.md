# pi-agent-client-hooks-structure Specification

## Purpose
TBD - created by archiving change refactor-client-hooks. Update Purpose after archive.

## Requirements

### Requirement: client-hooks 目录结构单一职责

`packages/core/src/lib/integrations/pi-agent/client-hooks.ts`（1317 行）SHALL 拆分为 `client-hooks/` 目录：全局会话 store、公共类型、API 客户端（SSE 解析/会话初始化/非流式发送）、非流式发送流程、流式发送流程、主 hook 各自独立成文件，`index.ts` SHALL 承接拆分前全部公共导出符号（`_updateSessionState`、`_subscribeToSession`、`ClientAgentEvent`、`UseClientPiAgentState`、`usePiAgent`、`usePiAgentEvent`、`usePiAgentStatus`）；原 specifier（`@originos/core/lib/integrations/pi-agent/client-hooks` 及相对导入 `./client-hooks`）语义 MUST 保持不变，全仓调用方 import 零改动。

#### Scenario: 目录划分与行数

- **WHEN** 查看 `packages/core/src/lib/integrations/pi-agent/client-hooks/` 并执行 `wc -l`
- **THEN** SHALL 存在 index/session-store/types/api/message-send/message-stream/use-pi-agent 文件，每个新文件 SHALL ≤ 600 行且首部有一句话职责注释

#### Scenario: 导出符号与调用方不变

- **WHEN** 对比拆分前后 client-hooks 公共导出清单，并执行 `grep -rn "client-hooks"` 与 `node scripts/expand-core-exports.cjs --verify`
- **THEN** 符号集合 diff SHALL 为空，消费方 import specifier SHALL 零变化，exports verify SHALL 通过（仅条目 target 路径变化）

### Requirement: 发送流程外移不改行为

`sendMessage` 与 `sendMessageStream` 函数体 SHALL 外移为模块级函数，闭包对 hook 作用域的引用 MUST 仅通过显式 deps 对象字段改写；函数体内部局部变量、事件处理顺序、Electron IPC 与 Web SSE 双分支结构、render 调度节奏 SHALL 逐字保持；useCallback 依赖数组语义（`[emitEvent]`）MUST 不变。

#### Scenario: 流式回归与循环不回退

- **WHEN** 执行 web/desktop 测试基线、`client-hooks-session-isolation.test.ts`、TC-5 流式冒烟与 `npx madge --circular packages/core/src --extensions ts,tsx`
- **THEN** 测试通过数 SHALL ≥ 基线（web 425 / desktop 182），Skill 对话流式收发 SHALL 事件流到达且无错误，madge 循环数 SHALL ≤ 基线 12 且 `client-hooks/` 内部无环

#### Scenario: 双端编译与打包门禁

- **WHEN** 执行 `pnpm --filter @originos/web build`、`pnpm --filter @originos/desktop build`
- **THEN** 双端 SHALL 0 error（exports target 指向新目录后打包解析不回退）
