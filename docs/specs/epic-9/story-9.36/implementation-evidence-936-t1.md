# 936-T1 运行时接线证据（2026-09-27）

## 实现边界

生产 `executeSupervisorDag` 与 facade `CollaborationExecutionStore.advance` 已接入观测。现有 Run/WorkItem ledger、readiness、verifier、outcome 和 evidence 接纳仍为业务事实源。本轮不改写旧静态 `executeMultiAgentDag` 的历史调度/HITL 语义，也不将观测回执用于业务接受。

- Supervisor 状态 60s、报告 120s、Worker 进度 45s；计时器 unref，HITL 暂停、恢复、取消、失败和结束管理集中在宿主。单 session 拒绝重入；同 run 并行 WorkItems 共享一套计时器、引用计数退出。
- Supervisor 的 AGENT_END 只写 reported；run_verifier 绑定精确 task/result 身份，旧 verifier 结果不能接受重派后的任务。整体结果按当前派发任务的验收状态汇总，历史未通过任务保留。
- trigger/depend 上游在 TASK_STARTED 前检查；缺失任务、reported、未完成、错误 writer 的输出不能满足依赖。WorkItem 继续使用既有 readiness 门控。
- Blackboard.memoryIndex 从现有 sharedData 派生；恢复不维护另一份索引事实。
- 宿主观测写独立 `protocol-observation.json`，不覆盖子进程 artifact 所在 blackboard.json。Run 观测位于 `collaboration-observations/{runId}/{hostHash}/`；按宿主隔离、串行原子替换，读取权威 revision，不产生执行重试。
- 公共 `getSessionTaskSnapshot` 与 `/api/collaboration/sessions/[id]/snapshot` 支持无执行的恢复查询，未知 session 为 404；contract reported 保持活跃，最近终端任务按最后 attempt 更新时间选取。
- CapabilityMatcher 用实际任务数及已验收历史成功率计算负载项；Supervisor 派发响应返回实时排序候选，保留显式目标选择。没有采集 CPU/内存时省略指标。

## 功能验收用例

| 范围 | 可重复证据 |
|---|---|
| M1/M2/M3/M4/M5 组件协议 | `__tests__/story-9.36.test.ts`，34 cases；完成报告断言已更新为 reported |
| 生产三 Agent 串行和并行 | `engine/__tests__/supervisor-protocol.integration.test.ts`；串行验证前阻塞、验收后放行；并行取消 timer 为零 |
| HITL / stale verifier | 同上；暂停全部周期写入，恢复活跃 worker；旧 verdict 不能接受新 dispatch |
| 依赖/写入安全/M6 | `__tests__/protocol-safety.test.ts`；缺失/reported/错误 writer 不放行、flush 不抹除 worker artifact、相同能力按真实负载排序 |
| contract 并发取消 | `facade/__tests__/protocol-observation.test.ts`；两独立 WorkItems 同 run 仅三个 timer；cancel 清零，晚到回执不接受，最终观测 revision 一致 |
| 恢复/性能 | `facade/__tests__/protocol-snapshot.test.ts`；10 Agent 查询 <100ms；逆序终端按时间选最新；reported 不冒充完成；读取不改 ledger |
| API | Web `snapshot/__tests__/route.test.ts`；404、恢复投影响应 |

## 验证限制与基线

上述生产入口测试替换模型和子进程外部边界，保留真实 dispatcher/ledger/持久化逻辑；不是实时模型或发布包验证。未本地打包、未推送远端。

旧 `engine/__tests__/capability-matcher.test.ts` 与现有本体评分模型不一致：原 HEAD 24 cases 中 12 failed；本轮真实负载项实现后 10 failed。新负载用例通过；不声称旧全套评分模型回归通过。旧静态 DAG/HITL 其他测试失败按基线独立治理。

936-T1 的实施/测试已完成，Story 整体与 Proposal 2.x 集成验收由父任务完成后更新，当前保留 In Progress。

## 本地检查结果

- 定向 Core 7 suites / 67 tests 全通过；随后增加 depend/阻塞清理回归，安全 suite 4/4 通过（合计覆盖 68 个不同 Core cases）。
- Web snapshot route 2/2 通过。
- Core `tsc --noEmit --incremental false --composite false` 退出 0。
- `pnpm lint` 退出 0；存量 warning 保留，新增 route warning 已消除。
- `pnpm lint:boundaries`：946 生产文件、0 诊断；架构 self-test：43 用例 × 2 CWD 通过。

## 主仓串行集成验收

2026-09-27：按 P2.6 → P2.7 → 9.36 合入本地 `0.4.x`。主仓运行 Core 7 文件 68 测试及 Web API 2 测试，全部通过；Core/Web 全量严格类型检查、lint、架构扫描、自测和 OpenSpec strict 验证通过。本轮批准实施范围已完成；Story 保留真实并发性能待验收项。

扩大回归的改动前基线：24 文件共 333 测试中有 18 失败（旧 matcher 12、旧静态 DAG HITL 3、临时目录缺少 tsx 的进程测试 3）。本次不把定向通过解释为全仓全部测试通过。10 Agent 性能验证为快照夹具，并非 10 个真实模型进程压测。未验证正式安装包或人工桌面体验。
