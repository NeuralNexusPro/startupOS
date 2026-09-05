# 开发文档 - Story M.12

**Story:** Hindsight-inspired 全局用户认知与 Agent 世界模型分域  
**最后更新:** 2026-08-28

## 实施顺序

### Phase 1：分域基础

- [x] 新增 cognition bank types、scope-safe path resolver 与 DataFile store。
- [ ] 新增 retain/recall 公共 API：retain 已完成，recall 待接现有 embedding/keyword 能力。
- [ ] 测试 user/agent/project 物理隔离、路径穿越与损坏恢复：隔离与路径穿越 case 已编写，损坏恢复待实现。

### Phase 2：M.11 管线改造

- [ ] `MemoryCore` 接收显式 ownership context，不再只接收 `agentDir`。
- [ ] consolidator 把 user signals 路由到 user bank，把 world/tool signals 路由到 agent/project bank。
- [ ] `human` block 改为 legacy read-only adapter；停止 Agent `Memory.md` 新写。

### Phase 3：Observation 与 Mental Model

- [ ] evidence fold 支持新增、增强、冲突、撤回，不静默覆盖。
- [ ] 新增 ObservationPolicyResolver，覆盖 role-agent、project、standalone-skill、inherited-skill。
- [ ] 为 RoleAgent 与 Project 使用不同 prompt template、证据阈值、temporal/conflict policy。
- [ ] 定义用户 Profile 和 Agent World Model 两个首批物化模型。
- [ ] 刷新过程异步化，启动只读 snapshot。

### Phase 3.1：Knowledge / Pattern 适配

- [ ] world fact / observation 通过公共 candidate contract 接入现有 KnowledgeProvider。
- [ ] experience / correction 通过 PatternEvidence adapter 接入新版 PatternProvider。
- [ ] Pattern 增加 owner、evidence、proofCount、applicability 和稳定幂等 key，保留 extractor/renderer 主体。
- [ ] RoleAgent 注册 KnowledgeProvider；Project 与 RoleAgent 通过同一 Provider factory 装配。
- [ ] 审计并移除旧 PatternProvider、EnhancedPatternProvider 的运行时引用，确保单写。

### Phase 4：运行时接线

- [ ] agent-manager、persistent-agent-manager、role-agent launcher、multi-agent worker 显式传 ownership context。
- [ ] Skill 只获得只读 user snapshot，禁止 profile 工具写入其工作目录。
- [ ] Standalone Skill 禁用持久 Knowledge/Pattern Provider；Inherited Skill 将 evidence 路由给调用方 Provider。
- [ ] desktop/web consolidate 边界只解析参数并调用 core 服务。

### Phase 5：迁移

- [ ] 扫描 legacy human block/Taste 用户信号，生成带 provenance 的候选记录。
- [ ] 写入迁移标记，迁移幂等；保留原文件，不做破坏性删除。
- [ ] 更新 Epic M、Epic C 和数据目录规约。

## 兼容策略

旧构造器短期保留并标记 deprecated，默认映射到 agent scope；只有显式提供 userId 和 dataRoot 时才启用全局 Profile 写入。切换完成前不得把 Agent 内 human block 当作全局真相。

## 审查要点

- 任意写入是否能由 scope + ownerId 唯一解释。
- Skill 是否偷偷复制或持久化用户 Profile。
- Skill 的认知 owner 是否来自显式 caller context，而非仅凭 agentBaseDir 猜测。
- Project 与 RoleAgent 是否使用各自 Observation Policy，Pattern applicability 是否正确。
- observation 是否保留证据、proofCount 和冲突历史。
- 是否出现 core 反向依赖、同步 LLM 阻塞 turn 或不符合 DataFile 的 JSON。
