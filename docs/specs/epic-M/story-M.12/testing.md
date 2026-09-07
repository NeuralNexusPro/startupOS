# 测试文档 - Story M.12

**Story:** Hindsight-inspired 全局用户认知与 Agent 世界模型分域  
**最后更新:** 2026-08-28

## 测试目标

通过本 Story 定义的测试 case，证明用户 Profile 全局唯一、Agent 世界认知隔离、Skill 只读消费，以及 retain/recall/reflect 的证据闭环。

## 自动化测试 Case

| ID | 类型 | 场景 | 预期 |
|---|---|---|---|
| M12-UT-01 | 单元 | resolve user/agent/project bank path | 全部位于 dataRoot 或 owner workDir 内，非法 ID 被拒绝 |
| M12-UT-02 | 单元 | retain 相同事实两次 | 规范化去重，proofCount 增长，证据均保留 |
| M12-UT-03 | 单元 | retain 相反事实 | observation 标记 conflicted 或降低置信度，不覆盖旧证据 |
| M12-UT-04 | 单元 | DataFile 读写 | version/createdAt/updatedAt/data 完整，原子替换 |
| M12-IT-01 | 集成 | Agent A 写用户偏好，Agent B 读取 | 只写 `data/users/default/cognition`，B 可读；A/B 目录无副本 |
| M12-IT-02 | 集成 | RoleAgent 工具成功/失败经验 reflect | 只生成当前 Agent observation/reflection，用户 Profile 不变 |
| M12-IT-03 | 集成 | Skill prompt 组合 | 能看到只读用户快照，Skill 目录不生成 Profile/Taste 文件 |
| M12-IT-04 | 集成 | Project 与 Agent 使用同一事实 | 两个 bank 独立，按 scope 查询不串数据 |
| M12-IT-05 | 集成 | legacy human block 迁移两次 | 候选只生成一次，原文件保留，迁移标记存在 |
| M12-UT-05 | 单元 | RoleAgent 与 Project 解析同一 evidence | 返回不同 policy、prompt template、conflictMode 和 applicability |
| M12-UT-06 | 单元 | Skill 无 caller ownership context | 强制解析为 standalone-skill/ephemeral，禁止持久化 |
| M12-IT-06 | 集成 | RoleAgent observation 路由 | world fact 进入 Agent Knowledge，experience 进入 role-wide Pattern |
| M12-IT-07 | 集成 | Project observation 路由 | 项目事实进入 Project Knowledge，经验进入 project-local Pattern |
| M12-IT-08 | 集成 | Standalone Skill session end | Skill 目录无 Knowledge.md、Patterns.md、cognition bank |
| M12-IT-09 | 集成 | Skill 在 Project 中执行 | evidence 进入 Project Provider，包含 sourceSkillId，Skill 无自有认知副本 |
| M12-IT-10 | 集成 | Skill 在 RoleAgent 中执行 | evidence 进入 Agent Provider，并采用 role-agent policy |
| M12-IT-11 | 集成 | Project 决策替代 | 旧事实 validTo 关闭，新事实记录 supersedes，未静默覆盖 |
| M12-IT-12 | 集成 | 重复 Pattern evidence | Pattern 不重复插入，proofCount 与 evidenceRefs 增长 |
| M12-SEC-01 | 安全 | ownerId=`../../outside` | 拒绝且 workspace 外无文件 |
| M12-SEC-02 | 安全 | retain 含 token/secret | 阻断或脱敏后才进入存储 |
| M12-PERF-01 | 性能 | 10K records recall | p95 <200ms，mental model 启动读取不调用 LLM |

## 关键失败与边界路径

- JSON 损坏、版本文件缺失、embedding 不可用时回退关键词且不跨 bank。
- 空 turn、临时计划、无证据 LLM 猜测不得晋升 observation。
- userId 缺失时只允许单用户 `default`；多用户配置返回明确错误。
- session end 中途失败后可重试，proofCount 不重复累计。
- entryType 为 skill 但 agentBaseDir 指向 Project 时，只有显式 caller ownership context 才允许 inherited-skill；缺失时仍按 standalone 处理。

## 验证 Goal

实现完成后必须创建自动化测试验证 goal：**“通过 Story M.12 中定义的全部测试 case”**。执行 memory-core 单元/集成测试、相关 launcher 测试、`pnpm lint`；无法自动化的认知质量评估需记录样本、人工步骤和剩余风险。

## 当前状态

- 规格与测试 case：✅ 已补齐
- 自动化实现：⬜ 待 Phase 1 开始
- E2E/人工认知质量验证：⬜ 待实现后执行
