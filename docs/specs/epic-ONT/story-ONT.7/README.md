# Story ONT.7：Context Projection Protocol

**Epic:** ONT  
**状态:** ✅ Done（ONT7-T1 / ONT7-T2 Done）
**Owner:** Architecture / Core  
**Task:** ONT7-T1 / ONT7-T2
**最后更新:** 2026-09-22

## User Story

作为方案设计和多 Agent 运行时开发者，我需要共享的语义上下文与检查点引用协议，以便每个 work item 使用正确的本体、契约、事实和决策版本并可定位恢复边界。

## 验收摘要

- [x] context 明确绑定 task/session/branch/run/workItem/attempt 与 contract/ontology 版本。
- [x] snapshot 仅保存对象、事实、决策和来源引用。
- [x] projection 覆盖九类最小运行语义。
- [x] checkpoint 可表达 cursor、revision、attempt 和 lease epoch。
- [x] ONT7-T1 不实现存储、调度或自动恢复。
- [x] ONT7-T2 提供按 execution identity 的 projection query 与 latest 语义。
- [x] ONT7-T2 精确解析 fact references，失败时返回结构化错误且不返回部分结果。

现有 store 已提供 projection JSONL append/read；ONT7-T2 只补公共查询与只读 resolver，不提前实现上层适配、授权或恢复协调。

## 文档

- [需求](requirements.md) · [交互](interaction.md) · [架构](architecture.md) · [实施](implementation.md) · [测试](testing.md)
