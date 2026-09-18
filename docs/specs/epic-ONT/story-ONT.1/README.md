# Story ONT.1：Canonical Ontology Schema 与公共类型

**Epic:** ONT  
**状态:** 🟡 In Progress  
**Owner:** Architecture / Core  
**Task:** ONT1-T1  
**最后更新:** 2026-09-18

## User Story

作为项目设计与运行时模块开发者，我需要一套唯一且版本化的业务语义类型，以便访谈概念、Agent/Skill 契约和运行任务引用同一对象与业务状态。

## 验收摘要

- [ ] canonical model 覆盖三层结构、业务状态、事实、Rule、Action、Event 和 Projection。
- [ ] 来源、ontology、概念与事实引用可跨模块稳定传递。
- [ ] Agent/Skill contract DTO 通过 ontology feature 公共入口导出。
- [ ] 不破坏旧本体类型，不引入存储、迁移或运行时校验。

## 文档

- [需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)
