# 功能需求 - Story R.3

**Story:** 技能扫描器
**Epic:** R - RoleAgent pi-agent 循环重构
**最后更新:** 2026-04-27

---

## 📋 用户故事

作为 RoleAgent 系统，
我想扫描角色目录下 `.skills/` 中的已安装技能，
以便在 system prompt 中注入可用技能清单，引导 LLM 优先使用技能。

---

## 验收标准

- [ ] AC1: 扫描 `baseDir/.skills/` 目录
- [ ] AC2: 识别软链接（符号链接）并获取目标路径
- [ ] AC3: 从每个技能目录读取 SKILL.md 提取 name/description
- [ ] AC4: 返回技能列表包含 name, description, code, path
- [ ] AC5: `.skills/` 不存在时返回空数组，不抛异常

---

## 技术实现概要

**新增文件：** `src/lib/integrations/pi-agent/role-agent/skill-resolver.ts`

**依赖：** `fs` / `path`（Node.js 标准库）

---

## 🔗 相关文档

- [Epic R README](../README.md)
- [设计方案](../../../../.claude/plans/roleagent-pi-agent-loop.md#373-skill-resolver-ts)
