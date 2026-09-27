# 协同协议运行时接入设计

## Context
参照本 Story 审计，当前存在部分组件，缺少产品或运行时接线。

## Goals / Non-Goals
补齐已批准范围，保持现有权威契约与状态；不增加自动数据迁移或新事实源。

## Decisions
- 首先确认当前生产入口 supervisor-dag/facade、contract-bound WorkItem 两条路径；不能只接已废弃的 TaskOrchestrator。复用已有 heartbeat/reporter/snapshot/checker，必要时调整其接口。
- 9.42 Run/WorkItem ledger 与验证/接纳回执仍为权威。Blackboard 记忆索引、心跳与快照只做观测投影；Worker 返回只可 reported，只有 verifier/outcome/evidence 接纳后才 completed。禁止心跳自动重试副作用或把 reported 当 completed 依赖。
- 在宿主统一处理生命周期/IPC 事件以避免多个进程各写一份 Blackboard；进度 45 秒，Supervisor 状态 60 秒、报告 120 秒；计时器 unref、防重复启动、finally/abort/HITL 暂停清理。
- 依赖必须在 worker 实际启动前检查；缺失、失败、未验证的上游不能越过门控。既有 WorkItem readiness 保持唯一事实与权限门控。
- 快照查询复用同一会话实例或磁盘恢复，生命周期变化失效缓存，API 只解析请求和映射响应。core facade 导出公共读方法供 Web/desktop 复用。
- memoryIndex 派生于已有 sharedData，恢复重建，不引入第二持久化事实源。性能验收 10 Agents 快照小于 100ms。
- 能力匹配使用真实可获得的本体能力、进行中任务负载与历史结果；未知 CPU/内存不伪造。旧 CPU/内存强依赖调整为可选遥测，依据 Story 正文已采用 ontology workload 设计。
- 写入范围 core modules/collaboration-runtime、Web collaboration snapshot route/适配、必要 Desktop collaboration service/IPC、9.36 文档与测试；禁止修改 P2.6/P2.7 文件。
- 替代方案新增独立调度器/状态库会形成双事实源，因此拒绝。


## Risks / Trade-offs
存量组件行为可能与新 canonical 链路不一致 → 使用真实入口集成测试，发现冲突记录 Story 映射；不以孤立单测通过宣告全部完成。

## 实施边界
单一 subagent 在独立 Task worktree 实施上述文件，父代理负责规格与集成；与其他 Proposal 写入范围不重叠可并行。涉及跨路径接口时先通过公共 API。

## Migration Plan
无数据迁移，读取不得触发写入副作用。审查后按既定顺序集成本地 0.4.x，后续 dev/远端由用户另行指示。保留现有和本轮 worktree。
