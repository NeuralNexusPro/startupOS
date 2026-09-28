# 需求文档 - Story C.6

**Story:** 知识库本体集成
**Epic:** Epic C
**最后更新:** 2026-07-20

## 目标

实现知识库 wiki 页面与 Ontology 系统的双向同步。

## 设计要点

- wiki entities/ 页面 ↔ ontology entities 映射
- wiki concepts/ 页面 ↔ ontology concepts 映射
- LLM 更新 wiki 时，自动同步到 ontology JSON
- ontology 变更时，自动更新 wiki 摘要页面
- business-model.json 作为特殊知识源，启动时映射到 ontology + wiki
- 支持角色知识体系的插拔挂载（通过软链接或配置目录）

## 验收标准

- [ ] wiki ↔ ontology 双向同步
- [ ] business-model.json 自动载入知识库
- [ ] 一致性检查（lint 模式）
- [ ] 知识变更日志自动记录
