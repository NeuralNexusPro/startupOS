# Proposal

## Why

9.42 已有冻结契约、Run/WorkItem ledger、attempt/lease 和 Evidence 对账，但生产组装未注入真实 Worker、Verifier 或 HITL，所有正式 WorkItem 都会以 `WORKER_UNAVAILABLE` 失败。旧 Supervisor DAG 又会读取 latest manifest、动态改派和使用启发式 verifier，不能安全复用。

可追溯信息：Epic `9`；Story `9.42`；Task `942-T3`；Owner `Collaboration Runtime / Agent Runtime`；来源 `docs/specs/epic-9/story-9.42/`。

## What Changes

- 将 WorkItem 执行改为可恢复的短事务阶段机，以 revision/attempt/lease CAS 提交每一阶段，外部 I/O 不长期持有 Run 锁。
- 增加 facts/业务状态/权限/执行者可用性 readiness gate，以及 budget、终态聚合和稳定 Evidence provenance。
- 提供真实 Agent/Skill Worker、版本化 verifier registry、ONT Action outcome commit 与持久 HITL 适配。
- 统一 Web/Desktop 的 server composition，避免双宿主依赖漂移和 Worker 内 `submit_action` 自死锁。
- 在进程重启、并发宿主、同 Agent 多 WorkItem、暂停/取消/换 lease 场景验证不重复副作用。

非目标：不复用或扩展旧 `supervisor-dag.ts`；不在运行时生成 Workflow；不把 WorkItem 状态写成第二套用户 Task；不改变 P2.8 契约编译职责。

依赖：P2.8 approved contract、ONT OSDK/Action、9.41 public Task/Evidence adapter、现有 CollaborationExecutionStore。

上线：先以 Core composition 替换当前 Web/Desktop 手工组装，平台 smoke 通过后随 `0.4.x` 启用。回滚时停止新 Run，保留 ledger 与 Task Evidence，只读恢复既有运行，不回退到旧 Supervisor DAG。

## Capabilities

### New Capabilities

- `contract-bound-workitem-execution`: 冻结执行契约约束下的真实 Worker、Verifier、Action、HITL、Evidence 阶段执行与恢复。

### Modified Capabilities

无。

## Impact

- Packages：Core collaboration facade/integrations、agent server adapter、project server composition；Web/Desktop 只调整装配。
- Public APIs：新增 readiness、worker、verifier、outcome commit、HITL 和 mutation lock ports；扩展阶段 receipt DTO。
- Persistence：继续使用 Run ledger、ONT operations/facts 和 pi-tasks Evidence；HITL 写入同一 Run ledger，不新增第二事实源。
- Packaging：三平台 app.asar smoke 必须实际运行一条 frozen WorkItem 并验证恢复。
