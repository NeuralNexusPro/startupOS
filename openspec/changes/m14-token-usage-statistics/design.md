# Design：持久化并展示真实 Token usage

## 背景

Pi `AssistantMessage.usage` 已完整，但 Desktop/Web 在 `message_end` 只提取文本；Core `AgentMessage` 没有 usage 字段，恢复映射生成的零 usage 也无法与真实历史区分。

## 设计决策

1. 在 Core 公共会话类型增加可选 `usage` 和 `contextTokenEstimate`；结构对齐 Pi 数值字段但不依赖 integration 内部类型。
2. Desktop/Web 订阅 `message_end` 时捕获 usage，最终消息、done/SSE payload 和 session persistence 共同使用该值。
3. 增加纯函数 `summarizeSessionTokenUsage(messages)`；不新增 Manager 或累计文件。
4. 旧消息 `usage === undefined` 表示 unavailable。`runtime-history.ts` 的零 usage 只服务 Pi 类型，不回写持久统计。
5. 上下文估算抽出当前 `chars / 3` 纯 helper，复用预算逻辑；四个分区标记 `estimated: true`。
6. UI 使用现有折叠/按钮组件，在消息完成时从 session messages 重算。无新 store。
7. CostController 扩展 cache 分类和可选 cost；移除总 token 50/50 拆分，缺价时按真实 input/output 分项估算。

## 数据、IPC 与恢复

现有 session JSON 新增可选消息字段，旧数据无需迁移。Desktop IPC 和 Web SSE 最终事件增加可选 usage/context estimate，旧客户端忽略未知字段。恢复时聚合持久消息字段，不读取 Pi runtime synthetic usage。

## 性能与安全

汇总为 O(n) 且只在消息完成/会话加载时运行。仅记录数字，不记录 prompt 或召回正文。不得把 token/cost 指标用作跨 owner 数据键。

## 替代方案

- 新建 token ledger JSONL：与消息双写会漂移，拒绝。
- 引入 tokenizer：provider usage 已是真值，分区只需趋势估算，拒绝。
- 每个 delta 更新：产生无意义重渲染，拒绝。

## Subagent 实施边界

- Core task worktree：公共类型、聚合 helper、OriginOSAgent usage/context estimate 和测试。
- Desktop/Web task worktree：最终事件透传、持久化、现有会话 UI 与测试；不得复制聚合逻辑。
- Collaboration task worktree：CostController/Metrics 和 worker usage 接线；与主工作区脏 `agent-worker.mts` 改动隔离，由 integration owner 合并。

## 回滚

回滚读写和 UI；会话 JSON 的可选字段由旧代码忽略，无数据清理。
