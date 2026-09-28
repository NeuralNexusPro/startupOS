# 实施文档 - Story M.14

**Story:** 渐进式 Agent 上下文、KV Cache 与 Token 统计
**版本:** 1.0
**最后更新:** 2026-09-18

## 实施任务

### M14-T1：建立基线与统一目录渲染

- [x] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [x] 记录四条 Agent 链路的 system prompt 长度、Knowledge/Patterns 占比和前缀变化点。
- [x] 在现有 `memory-consumption.ts` 中复用/收敛目录提取，目录有固定预算与确定性输出。
- [x] 普通 Agent、RoleAgent 和协作 Agent 停止全文注入；Project Agent 改用同一实现。

### M14-T2：稳定前缀重排

- [x] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [x] 调整现有 prompt layer 顺序，明确 stable system prompt 与 session context 边界。
- [x] 为组装结果计算 hash 和长度；不记录正文。
- [x] 阶段、Memory、工作目录、runtime environment 和额外指令只改变稳定边界之后的内容。
- [x] Tool/Skill 配置真实变化时允许缓存自然失效。

### M14-T3：接入 turn prefetch

- [x] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [x] 在现有 Agent turn 上下文转换点调用 `CognitiveManager.prefetch(rawUserQuery)`。
- [x] 增加确定性聚合和统一字符预算，结果作为当前 turn 的受控参考上下文。
- [x] 覆盖 in-process、persistent 与 collaboration worker；Skill 沿用显式 owner 的只读策略。
- [x] 失败时跳过召回并保留安全诊断。

### M14-T4：接入 Pi prompt cache

- [x] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [x] 创建底层 Pi Agent 时传入稳定、非敏感的 session id。
- [x] 验证 Pi AI 默认 `cacheRetention=short` 在支持的 provider 上生效；不重复实现 `cache_control`。
- [x] 把 `cacheRead/cacheWrite` 接到现有 usage/observability 路径。

### M14-T5：Token usage 透传、持久化与展示

- [x] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [x] 在 Core 会话消息增加可选 provider usage 与上下文估算字段，不新增存储文件。
- [x] Desktop/Web 的最终消息事件保留 usage；历史恢复、会话切换和错误路径不得重复累计。
- [x] 增加纯函数 Session 聚合，并在 Agent/Skill 现有会话区域显示紧凑统计。
- [x] 协作 CostController/Metrics 消费真实 input/output/cache usage；provider cost 缺失时才估算。

### M14-T6：回归与文档

- [x] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [x] 执行 Story 测试矩阵和架构边界检查。
- [x] 用匿名大型 Patterns/Knowledge fixture 对比修改前后的输入规模与缓存 usage。
- [x] 实施完成后更新 AGENTS.md 中“Frozen Snapshot”描述：Core Memory 可冻结，Archival 内容渐进加载。

### M14-T7：会话顶部 Token 汇总

- [x] 按 `m14-token-usage-window-header` 将既有会话级 Token 汇总从消息滚动区移至宿主窗体消息区上方。
- [x] 复用 `summarizeSessionTokenUsage` 与既有 message usage；不新增 store、持久化字段、IPC 或统计页面。
- [x] 覆盖有真实 usage 时顶部显示、旧会话隐藏、详情可展开，以及消息区不重复展示。

## 实施结果

| Task | OpenSpec change | 结果 |
|---|---|---|
| M14-T1 | `m14-progressive-context-catalog` | `memory-consumption.ts` 提供共享、确定、单文件 1,600 字符目录；四条链路停止默认注入全文。 |
| M14-T2 | `m14-stable-prompt-prefix` | `prompt-boundary.ts` 分离 stable system 与只读 session context；只记录 hash 和长度，恢复时重建边界。 |
| M14-T3 | `m14-turn-cognitive-prefetch` | 当前用户 turn 绑定 owner/session 调用 Cognitive Provider；单 Provider 2,000 字符、总块 6,000 字符、1.5 秒超时。 |
| M14-T4 | `m14-pi-prompt-cache` | 底层 Pi Agent 接收稳定内部 `sessionId`，复用 provider-neutral cache 行为。 |
| M14-T5 | `m14-token-usage-statistics` | usage 随最终消息进入既有 session JSON；纯函数汇总、共享 UI 和协作 observability 已接通。 |
| M14-T6 | `m14-context-integration-verification` | 匿名矩阵 99 项通过；文档、主 capability specs 与公共架构边界完成同步。 |
| M14-T7 | `m14-token-usage-window-header` | 汇总在消息滚动区外的窗体顶部显示；复用既有 usage 聚合，旧会话隐藏。 |

实施没有新增 Prompt Manager、缓存服务、向量库、tokenizer 或统计存储。

## 实施顺序（已完成）

先做 T1 和 T2，单独获得上下文缩减与前缀稳定收益；再接 T3。T4 与 T5 复用同一个 provider usage 源，可以连续实施，但都不成为渐进加载的前置条件。

## 代码审查要点

- 没有新 Prompt Manager、缓存服务或第二套检索器。
- 不通过 `setSystemPrompt()` 注入每轮召回结果。
- 所有链路共享目录和预算逻辑，避免只修 RoleAgent。
- session id 和日志不包含用户内容或外部渠道身份。
- 动态安全/权限更新不会因缓存优化而被忽略。
- 不从文本长度反推 provider input/output；估算只用于上下文分区诊断。
- Session 汇总不另建累计存储，避免消息 usage 与总数双写漂移。

## 暂不实施

- provider 专属 cache breakpoint 调优。
- 基于 LLM 的 query rewrite 或 rerank。
- 新的 Context UI、手动开关和逐 Agent 配置面板。
- 重新设计 Memory Core 存储格式。
