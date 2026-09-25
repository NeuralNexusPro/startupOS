# 942-T3-E 恢复与安装包验收证据

日期：2026-09-25

## 自动化矩阵

| 场景 | 自动化证据 | 结果 |
|---|---|---|
| readiness claim 后强退 | `contract-bound-runtime-recovery.test.ts` 使文件锁 claim 过期，由新 composition 恢复 | 通过；Worker 仅调用一次 |
| Worker 已落盘 artifact、receipt 前强退 | 同测试在 Agent prompt 后写 artifact 并中止，重启复用同一 artifact | 通过；Agent 未重复调用 |
| Verifier claim 后强退 | 版本化 verifier 挂起，重启以相同 ref/schema 恢复 | 通过 |
| ONT Action 写入中强退 | Action intent 后、Fact 写入边界挂起，新 OSDK 对账恢复 | 通过；accepted operation 与 Fact 各一条 |
| Evidence receipt 前强退 | Evidence 端口接纳边界挂起，重启以相同 idempotency key 补 receipt | 通过；Action/Worker 未重做 |
| 同 Agent 多 WorkItem | 两个并行节点绑定同一 Agent | 通过；executionKey、artifact、Fact 隔离，Run 聚合 completed |
| Web/Desktop 双宿主 CAS | 两个生产 composition 并发提交相同 request | 通过；Worker 与 Evidence 各一次 |
| Token 预算 | Worker receipt 超过 maxTokens | 通过；Action/Evidence 均未执行，Run failed |
| 持久 HITL | before_execution 请求后重建 composition 并批准、重放批准 | 通过；同一 request/attempt，仅推进一次 |
| 安装包 frozen WorkItem | `verify-ontology-runtime.js` 从 app.asar 解包并调用公共 production composition | 通过；完整 Worker→Verifier→Action→Evidence，重启不重跑 |

## 关键命令

```bash
pnpm --filter @originos/core exec vitest run \
  src/lib/features/project/__tests__/contract-bound-runtime-recovery.test.ts \
  src/lib/features/project/__tests__/contract-bound-runtime-composition.test.ts \
  src/modules/collaboration-runtime/facade/__tests__/contract-execution-stage-machine.test.ts \
  src/lib/features/agent/server/__tests__/contract-bound-worker.test.ts \
  src/modules/collaboration-runtime/integrations/__tests__/contract-verifier-ontology-outcome.test.ts

pnpm --filter @originos/desktop build
pnpm --filter @originos/desktop verify:ontology-runtime
node packages/desktop/scripts/verify-ontology-runtime.js /tmp/p942-contract-runtime-smoke-*.asar
```

## 结论与边界

Task 3.2 的恢复、并发、预算、HITL、终态与 packaged frozen WorkItem 验收完成。最小 app.asar smoke 使用与 Electron 打包相同的编译产物布局，并验证模块解析和执行行为；三平台真实安装包矩阵仍由 ONT.8 平台验收及本 Proposal 的 3.3 集成门禁负责。
