# 需求 - Story R.6

**Story:** 重构 RoleAgent Launcher
**Epic:** R - RoleAgent pi-agent 循环重构
**最后更新:** 2026-04-27

---

## 📋 用户故事

作为 RoleAgent 系统，
我想在 Launcher 层集成上下文加载、状态机、记忆追踪和分层 prompt 构建，
以便让 RoleAgent 启动时自动进入 pi-agent 思维循环模式。

---

## 验收标准

- [ ] AC1: 启动时调用 `loadRoleContext()` 加载角色上下文
- [ ] AC2: 加载失败时降级到现有 buildAgentSystemPrompt 流程，不阻塞启动
- [ ] AC3: 成功加载时调用 `buildRoleSystemPrompt()` 构建 6 层 prompt
- [ ] AC4: 初始化 `MemoryTracker` 实例并绑定到会话
- [ ] AC5: 在 `turn_end` 生命周期钩子中调用状态机检查 + 记忆追踪
- [ ] AC6: 状态转换时触发 Role.md 文件更新
- [ ] AC7: 达到 flush 阈值时自动调用 `flushMemory()`
- [ ] AC8: 现有 RoleAgentLauncher 功能不受影响（向后兼容）
