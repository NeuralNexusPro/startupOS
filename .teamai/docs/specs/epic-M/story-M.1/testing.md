# 测试文档 - Story M.1

**Story:** 类型定义与 Block 抽象
**Epic:** M — Memory Core 记忆核心
**最后更新:** 2026-07-20

---

## 验收标准

- [ ] Block 类型包含 Letta BaseBlock 核心字段（value, limit, label, description, readOnly, metadata）
- [ ] 新增 namespace 字段支持层级标签
- [ ] 新增 tags 字段支持分类和语义检索
- [ ] 新增 version 字段支持版本追溯
- [ ] DEFAULT_BLOCKS 与现有 `cognitive/types.ts` 的 5 默认 blocks 一致
- [ ] 单元测试覆盖 Block 创建、验证、序列化
