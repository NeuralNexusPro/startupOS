# M.14 功能验证证据

**日期：** 2026-09-18

**分支：** `task/m14-context-qa`

**数据约束：** 全部运行输入均为匿名构造数据；本文只记录长度、hash、数值 usage 和测试结果，不记录 prompt、记忆或召回正文。

## 结果

| 验收范围 | 测试/检查 | 结果 |
|---|---|---|
| M14-UT-01/02、M14-IT-01/03 | `progressive-context-catalog.test.ts` | 6/6 通过；普通、Role、Project、协作链路只注入共享目录，空内容不产生空 section |
| M14-UT-03/04/05、M14-IT-02 | `stable-prompt-prefix.test.ts` | 7/7 通过；动态 phase、Memory、工作目录只改变 session context，稳定输入与安全/工具边界决定 stable hash |
| M14-UT-06、M14-SEC-01、M14-IT-06 | `turn-cognitive-prefetch.test.ts` | 4/4 通过；排序确定、预算生效、伪结束标签转义、召回只进入当前 turn、失败日志不含正文 |
| M14-SEC-02、M14-IT-04/05 | `provider-factory.test.ts`、`agent-manager-cognitive.test.ts`、`runtime-restore.test.ts` | 7/7 通过；显式 owner 不匹配被拒绝，独立 Skill 不创建持久认知，Role/Project 恢复后仍绑定原 owner/session 的 prefetch |
| M14-IT-05、M14-COMPAT-01 | `runtime-history-restore.test.ts`、`session-restore.test.ts` | 29/29 通过；历史映射保持渠道/会话隔离，旧消息无 provider usage 时保持 unavailable |
| M14-IT-07 | `agent.test.ts -t "passes stable isolated session ids"` | 1/1 通过；相同历史会话复用相同 Pi `sessionId`，不同会话隔离，未自建 provider cache 参数 |
| M14-UT-07/08、M14-IT-09 | `token-usage.test.ts`、`agent-token-estimate.test.ts` | 6/6 通过；逐字段聚合 cache usage，可选字段不伪造，旧会话不显示全零，分区估算沿用 `chars / 3` 并标记 `estimated` |
| M14-IT-08/10 | 新增 `client-hooks-session-isolation.test.ts -t "attaches provider usage"` 与 `chat-token-usage.test.tsx` | Core 1/1、Web 1/1 通过；delta 不写 usage，active stream 的 done 只更新一个 assistant message；共享会话组件显示聚合值且旧会话保持安静 |
| M14-IT-11 | `observability.test.ts` 与 `agent-spawner.test.ts -t "records normalized worker usage"` | 37/37 通过；CostController、MetricsRegistry 与 worker 接收真实 input/output/cache usage，provider cost 优先 |

上述针对性命令合计 **98 项通过**，另新增的 stream 完成时 usage 用例 **1 项通过**；没有修改生产代码。

## 匿名目录预算、前缀与 usage 证据

匿名 fixture 为 80 个二级标题及重复占位正文，不含用户数据。输入规模：

- `Knowledge.md`：52,559 字符
- `Patterns.md`：52,399 字符
- 原始合计：104,958 字符
- 单文件目录硬预算：1,600 字符
- turn recall 总预算：6,000 字符

四条链路的实际边界：

| 链路 | stable chars | session chars | stable hash | 全文缺席 |
|---|---:|---:|---|---|
| 普通 Agent | 1,639 | 3,073 | `8a60a8a3082d724ef55a7855b8aa103c0353348f517e79bd3b0ec860d8b5139d` | 是 |
| RoleAgent | 3,570 | 2,888 | `a2586c0dba0b00c07d56536cb83bc0e379ee3c4740a89e7b5f653d0449d4d1fd` | 是 |
| Project Agent | 1,435 | 2,915 | `5da76bc514e9999520c805b86af94cc79b0ff75566061a8807ebb90a1332aec3` | 是 |
| 协作 Agent | 761 | 2,859 | `cfa0f5d392bb99d6ad77af3a6059f9b65d2dedc7310cb0b7dcb126301816a65e` | 是 |

同一普通 Agent 只改变 Memory 与工作目录后：stable hash 保持不变，session context 发生变化。三组各 5,000 字符的匿名召回输入最终输出恰为 6,000 字符，并保留完整 reference 结束边界。

匿名 provider usage 两条消息与一条旧消息的聚合值为：`input=150`、`output=30`、`cacheRead=35`、`cacheWrite=12`、`totalTokens=180`；仅含旧消息的会话返回 unavailable。

## 执行命令

```bash
pnpm --filter @originos/core exec vitest run \
  src/lib/integrations/pi-agent/__tests__/progressive-context-catalog.test.ts \
  src/lib/integrations/pi-agent/__tests__/stable-prompt-prefix.test.ts \
  src/lib/integrations/pi-agent/__tests__/token-usage.test.ts \
  src/lib/integrations/pi-agent/__tests__/session-restore.test.ts \
  src/lib/integrations/pi-agent/core/__tests__/runtime-history-restore.test.ts \
  src/lib/integrations/pi-agent/core/__tests__/agent-token-estimate.test.ts
# 6 files, 48 tests, exit 0

pnpm --filter @originos/core exec vitest run \
  src/lib/integrations/pi-agent/cognitive/__tests__/turn-cognitive-prefetch.test.ts \
  src/lib/integrations/pi-agent/cognitive/__tests__/agent-manager-cognitive.test.ts \
  src/lib/integrations/pi-agent/cognitive/__tests__/provider-factory.test.ts \
  src/lib/features/agent/__tests__/runtime-restore.test.ts
# 4 files, 11 tests, exit 0

pnpm --filter @originos/core exec vitest run \
  src/lib/integrations/pi-agent/core/__tests__/agent.test.ts \
  -t "passes stable isolated session ids"
# 1 test, exit 0

pnpm --filter @originos/core exec vitest run \
  src/lib/integrations/pi-agent/__tests__/client-hooks-session-isolation.test.ts \
  -t "attaches provider usage"
# 1 test, exit 0

pnpm --filter @originos/core exec vitest run \
  src/modules/collaboration-runtime/observability/__tests__/observability.test.ts
# 36 tests, exit 0

pnpm --filter @originos/core exec vitest run \
  src/modules/collaboration-runtime/sandbox/__tests__/agent-spawner.test.ts \
  -t "records normalized worker usage"
# 1 test, exit 0

pnpm --filter @originos/web exec vitest run \
  src/components/ui/__tests__/chat-token-usage.test.tsx
# 1 test, exit 0
```

共享 UI 的静态引用检查确认 `ChatMessageList` 被 Agent/RoleAgent、Skill 和 Project interview 现有入口复用；Desktop/Web 的最终 `done`/`message_end` 边界均调用同一个 Core usage normalization/summary，逐消息 usage 仍写入既有 session JSON。

## 非阻塞基线问题

首次把 `agent-spawner.test.ts` 全文件并入矩阵时，隔离 worktree 的子进程工作目录 `/tmp/test` 无法解析 `tsx`，使非 M.14 的“creates and lists processes” smoke 用例失败；同文件的 M14-IT-11 usage 用例单独执行通过。该问题是测试环境命令解析基线，不是 usage 计量失败。

`client-hooks-session-isolation.test.ts` 全文件存在两个既有监听器数量断言失败（期望 2/1，实际 4/2）；新增 M14 usage 用例单独及与本矩阵相关路径均通过。失败发生在旧 session isolation 断言，未修改生产代码，本 Task 不扩大范围修复。

真实 provider 的 cache 命中率依赖账号、模型和供应商实现，本地确定性矩阵只验证稳定 `sessionId` 和 `cacheRead/cacheWrite` 透传；不以延迟推断缓存命中。
