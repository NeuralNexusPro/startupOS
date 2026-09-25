# P28-T1-E 集成验收记录

**日期：** 2026-09-25
**隔离工作区：** `/tmp/startupos-p28-boundary.zTD6Xm`
**结论：** 通过；Task 3.1 可标记完成，3.2 保留给 Proposal integration owner。

## 验收结论

P2.8 的检查、发布、精确读取、撤销、产品入口和 consumer 边界已形成闭环。默认发布源不再隐式读取 legacy 文件；概念确认/歧义、Fact 状态和新鲜度策略进入发布门控与不可变 hash。`collaboration-runtime` 公共 barrel/facade 不再暴露 `parseTopology`、`DagExecutor` 或 `loadProjectTopology`，包导出也不再开放 `engine/*`；兼容拓扑查看由 solution feature 的只读投影提供。

## Story 测试矩阵

| ID | 结果 | 自动化证据 |
| --- | --- | --- |
| TC-U1 | PASS | `execution-contract.test.ts`：相同规范化输入得到相同不可变 contract/hash。 |
| TC-U2 | PASS | topology 未知节点、缺边、自依赖、环、孤立节点均返回结构化 `DesignGap`。 |
| TC-U3 | PASS | ontology flow validator 拒绝不兼容 FactType。 |
| TC-U4 | PASS | 节点缺 verifier/evidence schema 被门控，不补默认值。 |
| TC-U5 | PASS | 合约权限超出 reviewed policy 被拒绝。 |
| TC-U6 | PASS | store/service 与 integrity verifier 拒绝正文篡改。 |
| TC-I1 | PASS | confirmed solution 通过 service 原子发布 approved contract。 |
| TC-I2 | PASS | draft/reviewing 返回 `SOLUTION_NOT_CONFIRMED` 且不写文件。 |
| TC-I3 | PASS | 同内容并发幂等；不同内容复用版本冲突且原字节/hash 不变。 |
| TC-I4 | PASS | v1/v2 并存时按精确版本读取，9.42 Run 不追随 latest。 |
| TC-I5 | PASS | 默认版本化源遇到 legacy 返回 `LEGACY_COMPATIBILITY_SELECTION_REQUIRED`；只有显式 `legacy_compatibility` 才进入完整门控。 |
| TC-C1 | PASS | blocking `DesignGap` 分类显示并锁定发布，成功复查后恢复。 |
| TC-C2 | PASS | 发布后显示只读 contractId/version/hash 与撤销状态。 |
| TC-E1 | PASS | `SolutionDesignPublishing.integration.test.tsx` 从真实 SolutionDesign 选择 confirmed 版本、挂载发布容器并调用 typed client。 |
| TC-E2 | PASS | 发布面板冲突/已发布测试要求“创建新版本”；store 验证原契约不可覆盖。 |
| TC-A1 | PASS | `public-api-boundary.test.ts` 同时扫描 runtime root、facade 和 package exports，禁止设计解析/选择/DAG 构造 API。 |

## 语义场景

| ID | 结果 | 自动化证据 |
| --- | --- | --- |
| SC01 | PASS | ambiguous concept、空确认来源、未知来源均阻断发布并定位到 object slot。 |
| SC02 | PASS | 下游 required FactType 无兼容上游来源时 ontology flow 门控失败。 |
| SC03 | PASS | key 顺序归一化和重复编译保持 contract/hash 一致。 |
| SC04 | PASS | ontology/ref/action/permission 及 Fact freshness/state 改变均进入验证或产生新 hash。 |
| SC05 | PASS | 9.42 精确读取保留 ontology、访谈 sourceRefs、object/fact policy、task template 与 topology。 |
| SC06 | PASS | v2 发布后既有 v1 Run 仍恢复 v1 contract/hash。 |

## 依赖与消费者回归

- P2.5/P2.6/P2.7：`solution-design-source.test.ts` 与 solution compiler 覆盖精确版本、confirmed 状态、I/O、Workflow/Team 拓扑和 contractRef。
- 9.42：contract ledger/stage machine、verifier/outcome adapter 与 production composition 回归通过。
- ONT.8：cross-package contract/service/recovery 与 Desktop IPC/runtime wiring 回归通过。
- 兼容拓扑查看：`solution-topology-projection.test.ts` 验证最新设计版本、循环边只读投影、路径逃逸和畸形输入拒绝；Web/Desktop consumer 三包 typecheck 通过。

## 命令与结果

```text
Core 联合回归：14 files / 94 tests passed
Web 发布链路：7 files / 34 tests passed
Desktop ONT.8：2 files / 12 tests passed
Core/Web/Desktop TypeScript strict：通过
pnpm lint：0 errors（3150 条存量 warning）
pnpm lint:boundaries：939 个生产文件，0 条诊断
架构 self-test：43 个用例 × 2 个 CWD 通过
git diff --check：通过
openspec validate complete-solution-execution-contract-publishing --strict：通过
```

## 性能与覆盖率

- 200 节点执行契约编译测试通过 `< 5s` 断言。
- Core 编译/校验/hash/store/publishing 三文件 V8 statements/lines：`96.52%`；branches：`93.93%`；functions：`100%`。
- 其中 `execution-contract.ts` statements/lines：`99.87%`，覆盖结构、策略、语义和 integrity 失败路径。

## 剩余集成动作

Task 3.2 仍需由 integration owner 将 portable commit 合并至 `0.4.x`，在真实集成工作树复跑门禁并清理隔离 worktree。本记录不把该 Git 集成动作提前标记完成。
