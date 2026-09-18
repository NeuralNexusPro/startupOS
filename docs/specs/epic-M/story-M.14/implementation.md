# 实施文档 - Story M.14

**Story:** 渐进式 Agent 上下文、KV Cache 与 Token 统计
**版本:** 1.0
**最后更新:** 2026-09-18

## 实施任务

### M14-T1：建立基线与统一目录渲染

- [ ] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [ ] 记录四条 Agent 链路的 system prompt 长度、Knowledge/Patterns 占比和前缀变化点。
- [ ] 在现有 `memory-consumption.ts` 中复用/收敛目录提取，目录有固定预算与确定性输出。
- [ ] 普通 Agent、RoleAgent 和协作 Agent 停止全文注入；Project Agent 改用同一实现。

### M14-T2：稳定前缀重排

- [ ] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [ ] 调整现有 prompt layer 顺序，明确 stable system prompt 与 session context 边界。
- [ ] 为组装结果计算 hash 和长度；不记录正文。
- [ ] 阶段、Memory、工作目录、runtime environment 和额外指令只改变稳定边界之后的内容。
- [ ] Tool/Skill 配置真实变化时允许缓存自然失效。

### M14-T3：接入 turn prefetch

- [ ] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [ ] 在现有 Agent turn 上下文转换点调用 `CognitiveManager.prefetch(rawUserQuery)`。
- [ ] 增加确定性聚合和统一字符预算，结果作为当前 turn 的受控参考上下文。
- [ ] 覆盖 in-process、persistent 与 collaboration worker；Skill 沿用显式 owner 的只读策略。
- [ ] 失败时跳过召回并保留安全诊断。

### M14-T4：接入 Pi prompt cache

- [ ] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [ ] 创建底层 Pi Agent 时传入稳定、非敏感的 session id。
- [ ] 验证 Pi AI 默认 `cacheRetention=short` 在支持的 provider 上生效；不重复实现 `cache_control`。
- [ ] 把 `cacheRead/cacheWrite` 接到现有 usage/observability 路径。

### M14-T5：Token usage 透传、持久化与展示

- [ ] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [ ] 在 Core 会话消息增加可选 provider usage 与上下文估算字段，不新增存储文件。
- [ ] Desktop/Web 的最终消息事件保留 usage；历史恢复、会话切换和错误路径不得重复累计。
- [ ] 增加纯函数 Session 聚合，并在 Agent/Skill 现有会话区域显示紧凑统计。
- [ ] 协作 CostController/Metrics 消费真实 input/output/cache usage；provider cost 缺失时才估算。

### M14-T6：回归与文档

- [ ] 实施前为本 Task 建立并严格校验 OpenSpec Proposal。
- [ ] 执行 Story 测试矩阵和架构边界检查。
- [ ] 用真实较大 Patterns/Knowledge 样本对比修改前后的输入规模与缓存 usage。
- [ ] 实施完成后更新 AGENTS.md 中“Frozen Snapshot”描述：Core Memory 可冻结，Archival 内容渐进加载。

## 建议实施顺序

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
