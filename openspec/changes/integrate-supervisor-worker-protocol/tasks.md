# 936-T1 工作包

## 1. 实施（内部串行，与其他 Proposal 可并行）
- [x] 1.1 实施 subagent；依赖既有公共契约；写入范围见 design.md；完成真实入口接线与对应功能测试，证据为代码差异及测试输出。
- [x] 1.2 同一 subagent；依赖 1.1；范围 docs/specs/epic-9/story-9.36；补功能测试 case、验收映射与实施证据，未验证项不得标为完成。
## 2. 集成验收（串行）
- [ ] 2.1 父代理；依赖 1.2 及前序 Proposal；审查、Task 集成、定向回归、lint/boundaries/self-test、OpenSpec strict validation，Story verification goal 为本 spec 场景通过真实入口测试。
- [ ] 2.2 父代理；依赖 2.1；更新 Story/Epic 状态并合入本地 0.4.x；保留 worktree，远端/dev 合并及清理留待用户后续指示。
