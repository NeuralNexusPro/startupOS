# 实施计划 - Story 9.37

**Story:** HITL 直连与协作链路扁平化
**Epic:** Epic 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 实施计划（4 天）

| Day | 任务 | 交付物 |
|---|---|---|
| 1 | A.1 + A.2 + A.3：HITL 直连 + Supervisor prompt 精简 + Worker 元数据 | `supervisor-dag.ts` diff，单元测试通过 |
| 2 | B.1 + B.2 + B.3：Service / Bridge 合并，目录迁移，import 修复 | `npm run lint && npm run typecheck` 通过 |
| 3 | C：可观测性 + `hitl-trace.jsonl` + metrics 接入 | trace 文件落盘验证 |
| 4 | D：集成 + E2E + 文档 | 全部测试通过，PR review |

---

## 风险与回滚

### 风险

1. **Supervisor 错失中断信号**：worker HITL 期间，supervisor `wait_workers` 仍在等，可能超时 → 解决：worker HITL 期间暂停 wait_workers 计时
2. **HMR 后 hitlChannelByWorker 丢失**：解决：注册到 `globalThis` 同 `hitlResumerRegistry`
3. **目录迁移影响范围广**：解决：使用 git mv 保留历史，分两个 PR（HITL 直连 + 目录合并）

### 回滚

- HITL 直连可独立回滚：恢复 `wait_workers` 中 `worker_hitl_request` 字段 + supervisor prompt HITL 段落
- 目录合并不可独立回滚：必须配合所有 import 同步还原
