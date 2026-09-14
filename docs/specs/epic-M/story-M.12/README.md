# Story M.12: Hindsight-inspired 全局用户认知与 Agent 世界模型分域

**Epic:** M — Memory Core 记忆核心  
**状态:** ✅ Complete
**Owner:** OriginOS Core Team  
**创建日期:** 2026-08-28  
**最后更新:** 2026-08-28

## User Story

作为 OriginOS 用户，我希望系统跨 Agent、RoleAgent 与 Skill 持续理解我的偏好和个人风格，同时让每个 Agent 独立提炼其对世界的事实、经验和认知，以便获得一致的个性化体验，又不让角色产物污染全局用户画像。

## 简要验收标准

- [x] 用户 Profile、偏好和个人风格具备独立的 `data/users/{userId}/cognition/` bank 基础设施。
- [x] Agent/RoleAgent/Project 具备各自工作目录下的隔离 cognition bank 基础设施。
- [x] Skill 可读取组合后的用户认知上下文，但不得拥有或写入用户 Profile 副本。
- [x] retain / recall / reflect 三类能力通过 `memory-core` 公共 API 提供，并保留证据、来源和置信度。
- [x] RoleAgent、Project、Standalone Skill 与 Inherited Skill 使用各自 Observation Policy；Skill 不拥有长期认知。
- [x] world fact/observation 接入现有 Knowledge 链路，experience/correction 复用现有 Pattern 主链路。
- [x] 旧 `Memory.md` 可读兼容，新增写入不再把 `human` 用户画像落到 Agent 目录。

## 文档导航

- [需求](./requirements.md)
- [交互](./interaction.md)
- [架构](./architecture.md)
- [实施](./implementation.md)
- [测试](./testing.md)

## 变更历史

| 日期 | 变更内容 | 变更人 |
|---|---|---|
| 2026-08-28 | 基于本地 Hindsight 的 memory type、bank、observation、mental model 思路建立分域方案 | Codex |
| 2026-08-28 | 完成 Phase 1 分域 bank、DataFile 原子持久化、证据去重与路径防护底座 | Codex |
| 2026-08-28 | 补充场景化 Observation Policy、Knowledge/Pattern 路由及 Skill 继承规则 | Codex |
| 2026-09-09 | 完成 Phase 1 recall 公共 API、版本快照及损坏隔离恢复 | Codex |
| 2026-09-09 | 建立 MemoryCore 显式 ownership context 与隔离 user/owner bank | Codex |
| 2026-09-09 | 接通 user/owner cognition 分域 consolidator 与幂等证据路由 | Codex |
| 2026-09-09 | 完成 Phase 2：human legacy 只读、Project 显式 ownership 与运行目录分离 | Codex |
| 2026-09-09 | 完成 Phase 3 Observation Policy、证据折叠与只读 Mental Model 快照 | Codex |
| 2026-09-09 | 接通 Knowledge/Pattern candidate adapter、稳定 evidence key 与统一 Provider factory | Codex |
| 2026-09-09 | 完成 Phase 4 显式运行时归属、Skill 只读 Profile 与 consolidate 边界下沉 | Codex |
| 2026-09-09 | 完成 Phase 5 legacy human/Taste 幂等迁移、数据目录与跨 Epic 文档同步 | Codex |
