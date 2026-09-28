# 测试文档 - Story M.6

**Story:** MemoryProvider 集成 + 适配器
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

- [ ] MemoryProvider.prefetch 返回 Archival + Recall 语义结果
- [ ] MemoryProvider.sync_turn 不阻塞主流程（setImmediate）
- [ ] MemoryProvider.system_prompt_block 返回 Memory.compile('xml')
- [ ] MemoryAdapter 的所有兼容方法输出与旧实现一致
- [ ] 现有代码通过 adapter 使用新 MemoryCore，无需修改
- [ ] CognitiveManager 注册 MemoryProvider，build_snapshot_prompt 包含记忆快照
- [ ] 集成测试：完整 Agent 启动 → 对话 → 记忆编辑 → 重启 → 记忆恢复
