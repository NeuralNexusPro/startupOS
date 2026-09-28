# 测试文档 - Story M.5

**Story:** Memory Tools API
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

- [ ] core_memory_append 检查 block 存在性 + 只读 + 字符限制
- [ ] core_memory_replace 精确匹配 oldContent，不匹配时返回错误
- [ ] insert_memory_block 拒绝已存在的 label
- [ ] archival_memory_insert 返回保存 ID
- [ ] archival_memory_search 返回格式化搜索结果
- [ ] 所有返回值格式一致，Agent 可解析
- [ ] 单元测试覆盖正常路径和所有错误路径
