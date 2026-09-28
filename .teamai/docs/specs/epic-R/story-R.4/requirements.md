# 功能需求 - Story R.4

**Story:** 分层 System Prompt 构建器
**Epic:** R - RoleAgent pi-agent 循环重构
**最后更新:** 2026-04-27

---

## 📋 用户故事

作为 RoleAgent 系统，
我想用 6 层结构化 system prompt 替换当前的简单拼接方式，
以便让角色在每次对话中都能按照思维循环进行思考。

---

## 验收标准

- [ ] AC1: Layer 1 注入 Agent.md 全文（角色身份）
- [ ] AC2: Layer 2 注入当前阶段名 + 行为特征 + Memory.md（状态+记忆）
- [ ] AC3: Layer 3 注入思维循环指令（5 步：状态检查→意图理解→工具箱选择→执行响应→状态更新）
- [ ] AC4: Layer 4 注入已安装技能清单 + 可用系统工具列表（技能优先原则）
- [ ] AC5: Layer 5 注入 Taste.md 全文（风格指南）
- [ ] AC6: Layer 6 注入工作目录 + AGENT_PERMISSION_PROMPT（权限授权）
- [ ] AC7: 构建结果不包含其他 Agent 类型的特有内容

---

## 技术实现概要

**新增文件：** `src/lib/integrations/pi-agent/role-agent/system-prompt.ts`

**依赖：**
- `src/lib/services/launcher/base.ts` 的 AGENT_PERMISSION_PROMPT（Layer 1 依赖下层）
- `RoleContext` 类型（同层模块）

---

## 🔗 相关文档

- [Epic R README](../README.md)
- [设计方案](../../../../.claude/plans/roleagent-pi-agent-loop.md#374-system-prompt-ts)
