# Design：当前 turn 的认知预取

## 背景

`CognitiveManager.prefetch()` 已聚合 Provider，但生产 turn 未调用。M14-T1 删除全文后，需要在模型边界接通这一现有能力。

## 设计决策

1. Agent 实例持有已有 CognitiveManager 引用，context transformation 从本次最后一条原始用户消息取得 query。
2. 复用 `CognitiveManager.prefetch()`，不新增检索器；聚合器保留 Provider 内部排序并按注册顺序应用字符预算。
3. 结果编码为 `<originos_recalled_context trust="reference">` 模型侧消息，不进入持久 transcript。
4. 单 Provider 错误由现有 Manager 捕获；空结果不注入。
5. in-process、persistent、collaboration 共用同一纯函数预算/渲染逻辑；Skill 必须已有显式 owner 才允许 prefetch。

## 数据所有权与恢复

Memory ownership 和 ObservationContext 是事实源。禁止从 workingDirectory、projectId 或渠道身份猜测 owner。恢复时复用 session 创建时保存的 ownership。

## 性能与安全

不新增 LLM 调用。使用现有 Provider 查询；召回块视为不可信参考，不得覆盖 system 指令。日志只记录 provider 名、长度、耗时和错误类别。

## 替代方案

- 模型自行每次调用 memory tool：容易遗漏且增加一轮工具调用，作为 Level 2 保留但不作为唯一入口。
- 把结果写进 system prompt：破坏缓存且污染恢复，拒绝。

## Subagent 实施边界

- Task worktree 可写：CognitiveManager 公共聚合 helper、OriginOSAgent/context hook、persistent/in-process 接线、协作 worker 的 prefetch 接线及定向测试。
- 与当前主工作区未提交 `agent-worker.mts` 改动重叠时，Task 分支不得包含该改动；由 integration owner 后续三方合并。
- 不得写：UI、session usage 类型、Knowledge/Pattern 存储。

## 回滚

移除 context transformation 的 recall 追加；Provider 与数据保持不变。
