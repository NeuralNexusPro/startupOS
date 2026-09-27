# P26-T1 工作包

## 1. 契约闭环（串行）
- [x] 1.1 契约实施 subagent；依赖无；范围 templates/skills/solution-design、project-skill-creator、core types/skills/project/solution 与对应测试；统一生成/创建/读取契约并补成功与失败集成测试，证据为差异及测试输出。
- [x] 1.2 同一 subagent；依赖 1.1；范围 docs/specs/epic-P2/story-P2.6；补测试 case、canonical 验收映射和实际证据，不以样例存在替代验证。
## 2. 集成验收（串行）
- [ ] 2.1 父代理；依赖 1.2；审查并集成 Task 分支，运行定向回归、pnpm lint、pnpm lint:boundaries、架构 self-test 和 OpenSpec strict validation，记录失败基线；Story verification goal 为生成设计可发布且旧缺口不会越过门控。
- [ ] 2.2 父代理；依赖 2.1；更新 Story/Epic 状态并合入本地 0.4.x，保留 worktree 现场；远端推送/dev 合并与清理按用户后续要求执行。
