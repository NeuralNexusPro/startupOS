# 测试文档 - Story M.7

**Story:** Pattern 质量提升 + Memory 集成
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

- [ ] Pattern principle 包含有意义的工具链描述，而非截断的 thinking 文本
- [ ] Pattern 提取利用工具调用的成功/失败状态和返回结果摘要
- [ ] `EnhancedPatternStats` 包含 `toolResults`（每个工具的成功率、常见错误）
- [ ] Pattern 条目写入 Archival Memory，可通过语义搜索检索
- [ ] PatternProvider.prefetch 返回 Archival 语义结果（优先）+ 关键词结果（回退）
- [ ] Reflection 条目写入 Archival Memory，searchReflections 走语义搜索
- [ ] 一次性迁移：现有 registry.json + episodic-memory 批量导入 Archival
- [ ] 单元测试：提取的 pattern 包含工具链描述、成功率、场景、错误信息
