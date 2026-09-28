# Story M.14：渐进式 Agent 上下文、KV Cache 与 Token 统计

**Epic:** M — Memory Core 记忆核心
**状态:** 🟢 Done
**优先级:** 🔴 Critical
**创建日期:** 2026-09-18
**完成日期:** 2026-09-18
**最后更新:** 2026-09-18

## Story 概览

作为 OriginOS 用户，我希望 Agent 只在当前任务需要时加载经验模式和长期知识，并在连续对话中保持提示词前缀稳定，以减少无关上下文、首 token 延迟和重复输入成本，同时保留相关记忆的可恢复召回能力。

## 验收标准

- [x] Agent、RoleAgent、Project Agent 与协作 Agent 不再默认把 `Patterns.md` 或 `Knowledge.md` 全文注入 system prompt。
- [x] 稳定身份、规则、安全约束和工具协议组成字节稳定的 prompt 前缀；阶段、记忆、运行目录和召回结果位于可变尾部或当前 turn。
- [x] 复用 `CognitiveManager.prefetch()` / Memory Core 检索，按当前用户任务召回有界的 Pattern/Knowledge 片段；不新增向量库或第二套检索器。
- [x] 同一会话的稳定输入不变时，连续 turn 的 stable system prompt hash 保持一致；动态状态变化不重写稳定 system prompt。
- [x] Pi runtime 传递稳定 session id，并使用其现有 provider prompt-cache 能力；不在 Core 实现模型 KV 缓存。
- [x] 每个 assistant message 保留 provider 返回的 input/output/cacheRead/cacheWrite/reasoning/cost，并可按会话聚合；旧会话不伪造数据。
- [x] Agent 与 Skill 现有会话界面显示本会话 Token 汇总和上下文分区估算，无需新增独立统计页面。
- [x] M14-T7 将该会话级汇总移至消息窗体顶部；消息滚动区和单条消息不重复显示，旧会话无真实 usage 时保持隐藏。
- [x] 会话恢复后仍可按相同 ownership 召回，并且不会把其他 Agent、Project 或用户的认知内容注入当前会话。

## 完成结果

- 四条 Agent 链路统一使用最多 1,600 字符的 Knowledge/Pattern 标题目录；匿名 QA 的 104,958 字符正文未进入 system prompt。
- stable system prompt 与 session context 分离；同一稳定配置下，Memory 和工作目录变化不改变 SHA-256 hash。
- 每个用户 turn 按 owner/session 预取，单 Provider 最多 2,000 字符、总块最多 6,000 字符，失败 1.5 秒超时并安全降级。
- Pi Agent 使用稳定内部 session id；provider usage 随最终 assistant message 写入既有会话 JSON，并由消息纯函数汇总。
- Agent、RoleAgent、Project Agent、Skill 共用现有会话组件显示 Token 汇总；协作 CostController/Metrics 消费真实 input/output/cache usage。
- M14-T7 将汇总固定在消息窗体顶部；消息滚动区不重复渲染，旧会话保持隐藏，详情仍显示估算标识。
- M.14 针对性自动化共 99 项通过；Core 类型检查、Web 生产构建、lint、架构边界及 worker/package 校验通过。Web 全仓 type-check 与 Desktop build 仍被 M.14 之前已存在的 ontology 6 个严格类型错误阻塞，未记为通过。

验证证据见 [OpenSpec QA](../../../../openspec/changes/archive/2026-09-18-m14-context-integration-verification/evidence/qa.md) 与 [架构 QA](../../../../openspec/changes/archive/2026-09-18-m14-context-integration-verification/evidence/task-2.2-architecture-qa.md)。

## 范围边界

本 Story 调整 prompt 组装、认知预取接线、缓存参数和 Token usage 透传，并在现有会话界面增加紧凑统计。不引入新的存储文件、向量数据库、缓存服务或独立统计页面；不承诺所有模型供应商都有相同缓存命中率。

## 文档导航

- [需求](./requirements.md)
- [交互](./interaction.md)
- [架构](./architecture.md)
- [实施](./implementation.md)
- [测试](./testing.md)
- [返回 Epic M](../README.md)
