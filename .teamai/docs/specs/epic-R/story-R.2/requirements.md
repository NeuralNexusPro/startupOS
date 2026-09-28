# 功能需求 - Story R.2

**Story:** 状态机解析与推进
**Epic:** R - RoleAgent pi-agent 循环重构
**最后更新:** 2026-04-27

---

## 📋 用户故事

作为 RoleAgent 系统，
我想从 Role.md 中解析角色状态机，并在 turn_end 后判断是否需要状态转换，
以便让角色在不同阶段（准备/执行/复盘）展现不同的行为特征。

---

## 验收标准

- [ ] AC1: 从 Role.md 解析出阶段定义（name, behavior, entryCondition, exitCondition）
- [ ] AC2: 解析状态转换规则（from, to, condition）
- [ ] AC3: 根据消息历史判断当前阶段
- [ ] AC4: turn_end 后检查是否需要状态转换
- [ ] AC5: 状态转换时输出新阶段名称
- [ ] AC6: 状态转换标记需要触发 Role.md 文件更新

---

## 依赖关系

- 依赖 `role-context.ts`（Story R.1）提供的 `RoleContext` 中的 `roleMd` 字段
- 依赖 `@mariozechner/agent` 的 AgentMessage 类型（用于消息历史分析）
- 被 `system-prompt.ts`（Story R.4）消费当前阶段信息
