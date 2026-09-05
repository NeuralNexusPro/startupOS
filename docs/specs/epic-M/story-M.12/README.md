# Story M.12: Hindsight-inspired 全局用户认知与 Agent 世界模型分域

**Epic:** M — Memory Core 记忆核心  
**状态:** 🟠 In Progress（Phase 1）  
**Owner:** OriginOS Core Team  
**创建日期:** 2026-08-28  
**最后更新:** 2026-08-28

## User Story

作为 OriginOS 用户，我希望系统跨 Agent、RoleAgent 与 Skill 持续理解我的偏好和个人风格，同时让每个 Agent 独立提炼其对世界的事实、经验和认知，以便获得一致的个性化体验，又不让角色产物污染全局用户画像。

## 简要验收标准

- [x] 用户 Profile、偏好和个人风格具备独立的 `data/users/{userId}/cognition/` bank 基础设施。
- [x] Agent/RoleAgent/Project 具备各自工作目录下的隔离 cognition bank 基础设施。
- [ ] Skill 可读取组合后的用户认知上下文，但不得拥有或写入用户 Profile 副本。
- [ ] retain / recall / reflect 三类能力通过 `memory-core` 公共 API 提供，并保留证据、来源和置信度。
- [ ] RoleAgent、Project、Standalone Skill 与 Inherited Skill 使用各自 Observation Policy；Skill 不拥有长期认知。
- [ ] world fact/observation 接入现有 Knowledge 链路，experience/correction 复用现有 Pattern 主链路。
- [ ] 旧 `Memory.md` 可读兼容，新增写入不再把 `human` 用户画像落到 Agent 目录。

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
