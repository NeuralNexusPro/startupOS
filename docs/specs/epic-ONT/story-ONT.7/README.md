# Story ONT.7：Context Projection Protocol

**Epic:** ONT  
**状态:** 🟡 In Progress（ONT7-T1 Done，ONT7-T2 实施中）
**Owner:** Architecture / Core  
**Task:** ONT7-T1、ONT7-T2
**最后更新:** 2026-09-20

## User Story

作为方案设计和多 Agent 运行时开发者，我需要共享的语义上下文与检查点引用协议，以便每个 work item 使用正确的本体、契约、事实和决策版本并可定位恢复边界。

## 验收摘要

- [x] context 明确绑定 task/session/branch/run/workItem/attempt 与 contract/ontology 版本。
- [x] snapshot 仅保存对象、事实、决策和来源引用。
- [x] projection 覆盖九类最小运行语义。
- [x] checkpoint 可表达 cursor、revision、attempt 和 lease epoch。
- [x] ONT7-T1 不实现存储、调度或自动恢复。
- [ ] ONT7-T2 通过公共 OSDK 提供 projection append/query/resolver。
- [ ] append 在写盘前校验 project、当前 ontology/version、引用和 revision，并支持同 id 幂等重试。
- [ ] query 严格隔离 context/attempt，resolver 只解析 ONT 自有 fact 引用且不产生回写。

ONT7-T2 的实施范围、接口、边界和验证命令已写入本 Story；研发任务为 ARCH-201。

## 文档

- [需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)
