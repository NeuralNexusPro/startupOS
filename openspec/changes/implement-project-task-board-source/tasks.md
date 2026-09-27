# Tasks

## 1. 项目任务源

- [x] 1.1 `943-T1-A`（串行；Core runtime subagent；写入 `packages/core/src/lib/features/project/` 与定向测试）实现受控项目任务源，读取权威 Task Runtime 投影并关联同项目 Run；验证项目隔离、50 条分页、索引缺失重建和 unavailable。
- [x] 1.2 `943-T1-B`（串行；依赖 1.1；Core runtime subagent；写入同一模块与测试）复用公开 Task Runtime 控制端口执行 pause/resume/retry/cancel；验证 revision、requestId 幂等和 Task/Run 一致性。

## 2. 验证与集成

- [x] 2.1 `943-T1-C`（串行；依赖 1.2；Integration owner；写入 Story/OpenSpec evidence）运行定向测试、Core typecheck、边界检查、strict validation 与 diff check，更新 Story 9.43 的真实完成项。
