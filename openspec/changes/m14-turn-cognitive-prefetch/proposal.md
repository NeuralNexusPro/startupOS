# Proposal：接入当前 turn 的认知预取

## 可追溯信息

- epic-id：M
- story-id：M.14
- task-id：M14-T3
- owner：Memory Core / Pi Agent Runtime
- 来源：`docs/specs/epic-M/story-M.14/`

## Why

`CognitiveManager.prefetch()` 已能按 owner 检索 Memory、Pattern 和 Knowledge，但尚未进入真实 Agent turn。删除全文快照后，需要以有界、失败不阻塞的方式把相关片段提供给当前任务。

## What Changes

- 在现有模型上下文转换点用原始用户任务调用当前会话的 `CognitiveManager.prefetch()`。
- 按固定 Provider 顺序和统一字符预算附加受控 `<originos_recalled_context>` 参考块。
- 不改写持久化的原始用户消息，不调用 `setSystemPrompt()`。
- 覆盖 in-process、persistent 和 collaboration worker；Skill 只使用显式 owner。
- 单 Provider 失败时跳过并记录无正文诊断。

## 非目标

- 不新增 query rewrite、rerank 或 LLM 调用。
- 不创建第二套检索器或跨 owner 搜索。

## Capabilities

### New Capabilities

- `turn-cognitive-prefetch`：当前用户 turn 可获得 owner 范围内的有界相关认知参考。

### Modified Capabilities

无。

## Impact

- packages：`packages/core`
- public APIs：复用 CognitiveManager 和 Pi Agent context transformation。
- persistence：原始消息和 MemoryCore 数据格式不变。
- IPC / packaging：无协议变化；协作 worker 构建需回归。
- 依赖：M14-T1、M14-T2。

## 上线方案

以 owner 隔离、预算、错误降级和历史恢复测试通过为门禁；随 Core/worker 正常打包。

## 回滚方案

移除 turn context transformation 中的 prefetch 注入即可；认知数据不变。
