# 架构 - Story 9.29

**Story:** Supervisor 模式协调能力修复
**Epic:** Epic 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 关键文件

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| MODIFY | `src/lib/collaboration-runtime-bridge/multi-agent-executor.ts` | HITL 接入、任务化转写、Revision 复用进程、Barrier 检查上游 |
| MODIFY | `src/modules/collaboration-runtime/session/blackboard.ts` | Artifact API + Provenance |
| MODIFY | `src/modules/collaboration-runtime/sandbox/agent-worker.mts` | 新增 `blackboard_set_artifact` / `blackboard_get_artifact` 工具 |
| MODIFY | `src/modules/collaboration-runtime/engine/supervisor.ts` | 改名（如选 SUP-04 (b)）+ Verifier 加固 |
| MODIFY | `src/modules/collaboration-runtime/engine/dag-executor.ts` | computeTaskLevels 改 Kahn |
| MODIFY | `docs/design/multi-agent-runtime.md` | §5.3 措辞同步 |
| NEW | `docs/design/supervisor-mode-architecture-review-2026-05-21.md` | （已创建）本 Story 的源依据 |
