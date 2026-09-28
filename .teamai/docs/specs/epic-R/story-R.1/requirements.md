# 功能需求 - Story R.1

**Story:** 角色上下文加载器
**Epic:** R - RoleAgent pi-agent 循环重构
**最后更新:** 2026-04-27

---

## 📋 用户故事

作为 RoleAgent 系统，
我想在角色启动时加载完整的角色上下文（5 个 .md 文件 + 已安装技能），
以便为后续的状态恢复、system prompt 构建提供数据基础。

---

## 验收标准

- [ ] AC1: 从 `data/agents/{id}/` 读取 Agent.md, Role.md, Taste.md, Memory.md, Tool.md
- [ ] AC2: 文件不存在时返回 null，不抛异常
- [ ] AC3: 解析 Tool.md frontmatter 提取 allowedTools / disabledTools 列表
- [ ] AC4: 扫描 `.skills/` 目录获取已安装技能列表（name, description, code, path）
- [ ] AC5: 返回统一的 `RoleContext` 接口对象
- [ ] AC6: 不读取 `.claude/skills/` 目录（只读定义目录，运行时产物在 Agent 目录）

---

## 依赖关系

- 无 pi-agent 内部依赖（Layer 1 模块，符合单向依赖原则）
- 被 `state-machine.ts`、`system-prompt.ts` 等同层模块消费
