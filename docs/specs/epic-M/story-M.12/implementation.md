# 开发文档 - Story M.12

**Story:** Hindsight-inspired 全局用户认知与 Agent 世界模型分域  
**最后更新:** 2026-08-28

## 实施顺序

### Phase 1：分域基础

- [x] 新增 cognition bank types、scope-safe path resolver 与 DataFile store。
- [x] 新增 retain/recall 公共 API：recall 复用现有 embedding/keyword 能力并支持 kind/status 过滤。
- [x] 测试 user/agent/project 物理隔离、路径穿越与损坏恢复；损坏文件隔离后从最近有效版本恢复。

### Phase 2：M.11 管线改造

- [x] `MemoryCore` 接收显式 ownership context；旧 `agentDir` 构造器仅保留兼容且不会猜测 cognition ownership。
- [x] consolidator 把 user signals 路由到 user bank，把 world/tool signals 路由到 agent/project bank，并使用稳定 evidence key 保证重试幂等。
- [x] `human` block 改为 legacy read-only adapter；显式 ownership 下可读取旧值，但工具与 consolidator 均停止新写 Agent `Memory.md`。

### Phase 3：Observation 与 Mental Model

- [x] evidence fold 支持新增、增强、冲突、撤回，不静默覆盖。
- [x] 新增 ObservationPolicyResolver，覆盖 role-agent、project、standalone-skill、inherited-skill。
- [x] 为 RoleAgent 与 Project 使用不同 prompt template、证据阈值、temporal/conflict policy。
- [x] 定义用户 Profile 和 Agent World Model 两个首批物化模型。
- [x] 刷新过程异步化，启动只读 snapshot。

### Phase 3.1：Knowledge / Pattern 适配

- [x] world fact / observation 通过公共 candidate contract 接入现有 KnowledgeProvider。
- [x] experience / correction 通过 PatternEvidence adapter 接入新版 PatternProvider。
- [x] Pattern 增加 owner、evidence、proofCount、applicability 和稳定幂等 key，保留 extractor/renderer 主体。
- [x] RoleAgent 注册 KnowledgeProvider；Project 与 RoleAgent 通过同一 Provider factory 装配。
- [x] 审计并移除旧 PatternProvider、EnhancedPatternProvider 的运行时引用，确保单写；旧实现仅保留兼容定义/测试。

### Phase 4：运行时接线

- [x] agent-manager、persistent-agent-manager、role-agent launcher、multi-agent worker 显式传 ownership context。
- [x] Skill 只获得只读 user snapshot，禁止 profile 工具写入其工作目录。
- [x] Standalone Skill 禁用持久 Knowledge/Pattern Provider；Inherited Skill 将 evidence 路由给调用方 Provider。
- [x] desktop/web consolidate 边界只解析参数并调用 core 服务。
- [x] LLM reflect 设置 5 turn 最小门槛；门槛以下仅执行零 LLM 的明确偏好提取。

### Phase 5：迁移

- [x] 扫描 legacy human block/Taste 用户信号，生成带 provenance 的候选记录。
- [x] 写入迁移标记，迁移幂等；保留原文件，不做破坏性删除。
- [x] 更新 Epic M、Epic C 和数据目录规约。

## 兼容策略

旧构造器短期保留并标记 deprecated，默认映射到 agent scope；只有显式提供 userId 和 dataRoot 时才启用全局 Profile 写入。切换完成前不得把 Agent 内 human block 当作全局真相。

## 审查要点

- 任意写入是否能由 scope + ownerId 唯一解释。
- Skill 是否偷偷复制或持久化用户 Profile。
- Skill 的认知 owner 是否来自显式 caller context，而非仅凭 agentBaseDir 猜测。
- Project 与 RoleAgent 是否使用各自 Observation Policy，Pattern applicability 是否正确。
- observation 是否保留证据、proofCount 和冲突历史。
- 是否出现 core 反向依赖、同步 LLM 阻塞 turn 或不符合 DataFile 的 JSON。
