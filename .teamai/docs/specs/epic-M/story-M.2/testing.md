# 测试文档 - Story M.2

**Story:** Memory 集合 + compile/render
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

- [ ] `compile('markdown')` 输出与现有 `serializeBlocksToMarkdown()` 格式完全一致
- [ ] `compile('xml')` 输出紧凑 xml，包含 label/description/metadata/value
- [ ] setBlock 自动更新 version + updatedAt + save
- [ ] blocks.json 记录每次变更（保留最近 10 个版本）
- [ ] 从现有 Memory.md 正确解析 blocks（兼容 `parseBlocksFromMarkdown()`）
- [ ] 单元测试覆盖 CRUD + compile 格式 + 持久化
