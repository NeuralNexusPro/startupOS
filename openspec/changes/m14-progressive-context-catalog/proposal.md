# Proposal：统一渐进式认知目录

## 可追溯信息

- epic-id：M
- story-id：M.14
- task-id：M14-T1
- owner：Memory Core / Pi Agent
- 来源：`docs/specs/epic-M/story-M.14/`

## Why

普通 Agent、RoleAgent 和协作 Agent 仍会把 `Knowledge.md`、`Patterns.md` 全文注入 prompt，而 Project Agent 已采用目录式加载。需要统一为有界目录，先消除无关上下文和重复 token。

## What Changes

- 在现有 `memory-consumption.ts` 收敛确定性的 Markdown 标题目录渲染和固定字符预算。
- 普通 Agent、RoleAgent、Project Agent、协作 Agent 共用目录渲染，停止默认注入 Knowledge/Patterns 正文。
- 保留完整文件和现有 `read_file` / memory tools 按需读取路径。
- 不新增向量库、Provider、存储格式或依赖。

## 非目标

- 不接入每轮语义预取。
- 不重排稳定 system prompt。
- 不实现 Token usage 展示。

## Capabilities

### New Capabilities

- `progressive-context-catalog`：所有 Agent 入口以有界目录替代 Knowledge/Patterns 全文注入。

### Modified Capabilities

无。

## Impact

- packages：`packages/core`
- public APIs：扩展现有 memory consumption 公共 helper，不改变调用协议。
- persistence / IPC / packaging：无变化。
- 依赖：无；为 M14-T2、M14-T3 提供统一目录基线。

## 上线方案

随 Core 正常构建发布；通过四条 Agent prompt 单元测试确认正文不再出现且目录预算稳定。

## 回滚方案

回滚本 Proposal 的 Core 提交即可恢复旧 prompt 组装；不涉及数据迁移。
