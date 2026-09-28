# 测试 - Story 9.29

**Story:** Supervisor 模式协调能力修复
**Epic:** Epic 9 — Multi-Agent 协作运行时
**最后更新:** 2026-07-20

---

## 验收标准

### 实证级（端到端，必须通过）

1. - [ ] 在 `proj-1778321075425-gmv0zt4h8` 上以 Supervisor 模式跑通"project-config → design-data-import → review-task-manager"三棒
2. - [ ] project-config 触发 HITL → 用户回复项目信息后继续，不再被 verifier 误判 failed
3. - [ ] design-data-import 产出至少一个 ontology / wiki artifact 写入 Blackboard
4. - [ ] reviewer Agent prompt 中能看到 design-data-import 的 artifact 引用，并执行真实审查动作（非反问）
5. - [ ] 全 reviewer 失败时 report-generator 不启动

### 单元/集成级

6. - [ ] HITL waiting 状态不阻塞同层其他并行 SubTask（≥1 测试用例）
7. - [ ] 任务化转写产出符合 schema（`{ specificAction, acceptanceCriteria }`）
8. - [ ] Blackboard artifact 读写 + Provenance 元数据正确（≥1 测试用例）
9. - [ ] Revision loop 第二轮继承上轮消息历史（≥1 测试用例）
10. - [ ] computeTaskLevels 在菱形拓扑下分层正确（Kahn 测试）
11. - [ ] `buildSubTaskPrompt()` 输出不含路径字符串（无 `data/projects/`、无 `agentDir`）
12. - [ ] AGENT_START system prompt 包含 Agent.md，user prompt 段只含具体任务指令（SUP-10 验证）
13. - [ ] `npx tsc --noEmit --skipLibCheck` 0 error
14. - [ ] `npm run lint` 0 Error（针对本 Story 改动文件）
