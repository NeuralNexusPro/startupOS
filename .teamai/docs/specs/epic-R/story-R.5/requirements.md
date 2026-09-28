# 需求 - Story R.5

**Story:** Turn 行为分析与 Memory Tracker
**Epic:** R - RoleAgent pi-agent 循环重构
**最后更新:** 2026-04-27

---

## 📋 用户故事

作为 RoleAgent 系统，
我想在每个 turn_end 后分析用户消息意图并追踪记忆变化，
以便在达到 N 轮阈值时自动将累积记忆刷入 Memory.md。

---

## 验收标准

- [ ] AC1: turn_end 后提取用户消息的核心意图（一句话摘要）
- [ ] AC2: 维护 in-memory 记忆累积列表（意图 + 关键信息）
- [ ] AC3: 达到 N 轮阈值（默认 50）时，将累积记忆格式化为 Markdown 并追加到 Memory.md
- [ ] AC4: 刷盘后清空 in-memory 累积列表，重置计数器
- [ ] AC5: flushMemory 函数可被外部手动触发（如会话结束时）
- [ ] AC6: Memory.md 不存在时自动创建
