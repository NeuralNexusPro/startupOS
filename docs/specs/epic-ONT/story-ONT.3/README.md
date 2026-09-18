# Story ONT.3：旧模型迁移与兼容投影

**Epic:** ONT  
**状态:** 🚧 In Progress  
**Owner:** Architecture / Core  
**Task:** ONT3-T1  
**最后更新:** 2026-09-18

## User Story

作为旧项目维护者，我需要先预览并安全迁移旧本体数据，同时让尚未切换的读取方继续查看兼容视图，以便 canonical ontology 成为唯一写入事实源且旧数据不丢失。

## 验收摘要

- [ ] 支持旧 `Ontology`、访谈 `OntologyModel` 和 `business-model.json`。
- [ ] dry-run 不写盘，正式迁移先备份且拒绝覆盖。
- [ ] 回滚保留旧源与备份，并拒绝删除迁移后已修改的数据。
- [ ] 兼容投影只读，不形成第二写入源。

## 文档

[需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)
