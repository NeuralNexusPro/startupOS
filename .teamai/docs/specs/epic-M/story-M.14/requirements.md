# 需求文档 - Story M.14

**Story:** 渐进式 Agent 上下文、KV Cache 与 Token 统计
**版本:** 1.0
**最后更新:** 2026-09-18

## 实施前背景

实施前四条 Agent 链路的上下文策略不一致：Project Agent 已只注入 `Knowledge.md` / `Patterns.md` 目录，但普通 Agent、RoleAgent 和协作 Agent 仍可能注入全文。RoleAgent 还把阶段与记忆放在 system prompt 前部；Tool.md 或阶段变化会重新拼接整个 prompt。`CognitiveManager.prefetch()` 已存在，却没有接到实际 turn 输入。

Pi AI 已提供 `cacheRetention`、`sessionId` 和 `usage.cacheRead/cacheWrite`。OriginOS 当时的包装层没有明确传入稳定 session id，也没有用统一指标验证缓存效果。问题应在现有 prompt 与认知生命周期上修正，无需自行实现 KV cache。

## 功能需求

### FR1：上下文可见性分级

Agent 上下文必须按以下级别组织：

| 级别 | 内容 | 加载时机 |
|---|---|---|
| Stable System Prompt | 身份、不可变规则、思维协议、安全约束、紧凑工具协议 | 会话启动 |
| Session Context | 当前阶段、Core Memory、用户/世界模型、工作目录 | 会话启动或明确刷新 |
| Turn Recall | 与当前任务相关的 Pattern、Knowledge、Recall 片段 | 每个用户 turn 前 |
| On Demand | 完整模式、知识页面、技能说明和源文件 | Agent 工具调用时 |

### FR2：Pattern 与 Knowledge 渐进加载

- 默认会话上下文只包含用途说明和有界目录，不包含全文；稳定 system prompt 不承载动态召回正文。
- 当前 turn 使用现有 Cognitive Provider `prefetch(query)` 召回相关片段。
- 召回必须有统一总预算、单 Provider 上限、Top-K 和确定性排序。
- 无匹配结果时不得注入空标题或占位文本。
- Agent 可继续通过现有文件/记忆工具读取完整内容。

### FR3：稳定前缀

- 动态阶段、Memory、工作目录、额外任务指令和召回内容不得写回稳定 system prompt。
- 同一组稳定输入必须产生字节一致的前缀和 hash。
- 只有身份、规则、安全策略或工具协议发生实际变化时，stable system prompt hash 才能变化。
- 不得为“保持缓存”而延迟权限或安全策略更新。

### FR4：Provider 缓存接线

- OriginOSAgent 创建底层 Agent 时传入不可泄露业务内容的稳定 session id。
- 使用 Pi AI 已有 prompt cache 行为；需要时显式传递 `cacheRetention`，不直接拼装 provider 私有 `cache_control`。
- 供应商不支持缓存时继续正常执行。

### FR5：度量与诊断

每次模型调用可记录以下无内容指标：stable system prompt 字符数/hash、session context 字符数、turn recall 字符数、`cacheRead`、`cacheWrite`。不得记录 prompt、Pattern、Knowledge、用户消息正文或召回内容。

### FR6：Token 统计与展示

- 以 Pi assistant message 返回的 `usage` 为真实统计源，保留 `input`、`output`、`cacheRead`、`cacheWrite`、可选 `reasoning`、`totalTokens` 和 `cost`。
- Web、Desktop、普通 Agent、RoleAgent、Project Agent、Skill 与协作 worker 不得在流式映射或会话持久化时丢弃 usage。
- 每条 assistant message 可选持久化 provider usage 和上下文分区估算；Session 汇总从消息计算，不维护第二份累计账本。
- 上下文分区只使用现有字符启发式估算，必须标记为“估算”；不得增加 tokenizer 依赖。
- Agent/Skill 现有会话界面在消息窗体顶部以紧凑区域展示本会话 input/output/cacheRead/cacheWrite/total；该区域不属于消息滚动区，也不得在单条消息中重复展示。cost 和 reasoning 仅在 provider 返回时展示。
- 旧会话缺少 usage 时显示“无统计数据”，不得把恢复运行时补的零 usage 当作真实消耗。
- 协作运行时复用真实 provider usage 更新现有 CostController/Metrics，停止用固定比例推算 input/output；配额语义保持现有定义。

## 验收场景

### AC1：默认上下文缩减

- **Given:** `Patterns.md` 和 `Knowledge.md` 各包含大量内容。
- **When:** 任一受支持 Agent 启动。
- **Then:** system prompt 不包含两者全文，会话上下文只包含有界目录或按需读取说明。

### AC2：相关经验进入当前 turn

- **Given:** Memory Core 中存在与用户任务相关和无关的 Pattern。
- **When:** 用户发送任务。
- **Then:** 仅相关的有界片段进入该 turn，无关 Pattern 不进入请求上下文。

### AC3：前缀稳定

- **Given:** 身份、规则、安全策略和工具协议未变化。
- **When:** 阶段、Memory 或当前任务发生变化。
- **Then:** stable system prompt hash 不变，变化只发生在后续区域。

### AC4：会话与缓存关联

- **Given:** 同一历史会话连续发送两轮消息。
- **When:** provider 支持 prompt caching。
- **Then:** 两轮使用相同的非敏感 session id，usage 中可读取的 cache 指标被记录。

### AC5：所有权与恢复

- **Given:** 会话恢复或协作 worker 重启。
- **When:** 执行认知预取。
- **Then:** 使用原 session/owner 范围，不召回其他 owner 的内容。

### AC6：Token 统计

- **Given:** provider 为一个 assistant message 返回 usage。
- **When:** 消息流结束、保存会话并再次打开。
- **Then:** 逐消息 usage 保持一致，会话汇总等于各消息字段之和，并在消息窗体顶部显示真实值。
- **And:** 缺失字段保持 unavailable；上下文分区值明确标记为估算。

## 非功能需求

- 不新增第三方依赖或新的长期存储。
- Token 汇总从会话消息线性计算；会话列表需要汇总时由服务端一次计算，避免 UI 重复遍历。
- 预取失败不得阻断 Agent 回复，记录安全错误后以无召回上下文继续。
- Prompt 组装和预取不得把 Web/Desktop 依赖引入 Core。
- 上下文预算以可配置常量控制，但首版只保留一组默认值，避免配置扩散。

## 依赖与关系

- 复用 M.6 的 MemoryProvider、M.7 的 Pattern 检索、M.12 的认知 ownership 与 M.13 的单一 MemoryCore 链路。
- 将 C.9 中“Archival TOC 惰性加载”的设计落到全部 Agent 链路；C.9 不再单独定义 prompt 组装实现。
- Project Agent 现有目录式加载作为迁移基线，不复制一套新实现。
