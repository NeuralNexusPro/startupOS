# Tasks

## 1. P2.10-T1 后台物化闭环

- [x] 1.1 【串行；依赖：无；写入范围：packages/core/src/lib/features/project、对应 exports 与测试；负责角色：Core 实施 subagent】实现内部 JSON 任务账本、confirmed 三文件冻结、Agent/Skill/验证步骤规划、claim/完成/失败/恢复和看板隔离，并以 Core 单元测试证明幂等、断点恢复、单步失败和确定性验收。
- [x] 1.2 【串行；依赖：1.1；写入范围：packages/web/src/app/api/projects、templates/skills/solution-design、templates/skills/project-skill-creator 及对应测试；负责角色：集成实施 subagent】接入后台启动/查询边界，更新 Stage 4 为启动后台物化，补齐 Skill references 契约，并以 API/模板测试证明不再要求当前对话批量写入且不创建看板 Task。
- [x] 1.3 【串行；依赖：1.1、1.2；写入范围：docs/specs/epic-P2/story-P2.10、openspec/changes/materialize-solution-in-background；负责角色：Proposal 集成者】运行目标回归、`pnpm lint:boundaries`、架构自测、core exports 校验和 `openspec validate materialize-solution-in-background --strict`，记录 Story verification evidence，完成合并并清理隔离 worktree。
