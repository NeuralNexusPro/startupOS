# Story ONT.8：Cross-package Adapters 与端到端验证

**Epic:** ONT - Ontology Core 语义底座  
**状态:** 🟡 In Progress（Proposal 已批准；T1-A Readiness Audit 发现前置缺口）
**Owner:** Architecture / Core / Web / Desktop / QA  
**Task:** ONT8-T1  
**创建日期:** 2026-09-19  
**最后更新:** 2026-09-22

## Story 概览

### User Story

作为使用项目语义执行能力的用户，我希望 Web 与 Desktop 都能通过同一套已验证的公共边界完成从访谈、方案发布、多 Agent 执行到看板与中断恢复的流程，以便不同平台不会出现版本漂移、重复副作用、事实双写或无法恢复的任务。

### 验收标准（简要）

- [ ] AC1：Web API 与 Desktop IPC 对等消费同一 core application service，不复制业务规则。
- [ ] AC2：所有写操作精确绑定 ontology/contract/task/run/work item/attempt/lease/revision，并在不一致时 fail closed。
- [ ] AC3：ontology、solution contract、Task/Evidence、Run/WorkItem 与投影保持各自唯一事实源。
- [ ] AC4：重复请求、中断恢复、迟到输出与未知外部回执不会产生重复 Action、fact 或 Evidence。
- [ ] AC5：E01–E16 使用真实公共 adapter、真实文件持久化和故障注入逐项验收。
- [ ] AC6：旧项目不被静默迁移，Web/Desktop 错误语义等价且不泄露敏感内容。
- [ ] AC7：development、Windows x64、macOS x64/arm64 分别完成模块解析、IPC 与恢复 smoke；未执行平台不标记通过。

## 范围与依赖

ONT8-T1 交付 core 项目语义执行应用服务、Web API adapter、Desktop IPC/preload adapter、跨包契约夹具与联合验收 evidence。它只集成既有公共能力，不替代 P2.8、9.42、9.43 的实现。

前置依赖：ONT.1–ONT.7；P2.8 已发布 execution contract；9.42 Task/Run/WorkItem 与恢复；9.43 项目任务投影和命令；受控 pi-tasks public adapter。任一必需公共边界缺失时，正式入口必须返回 unavailable，不能用私有 import 或 mock success 绕过。

## 文档导航

- [需求](requirements.md)
- [交互](interaction.md)
- [架构](architecture.md)
- [实施](implementation.md)
- [测试](testing.md)
- [OpenSpec Proposal](../../../../openspec/changes/integrate-ontology-cross-package-adapters/proposal.md)
- [跨 Epic 主线规划](../project-semantic-execution-plan.md)
- [返回 Epic ONT](../README.md)

## 进度

- [x] Story 六份规格完成。
- [x] 独立 OpenSpec proposal/spec/design/tasks 已生成并通过工件完整性检查。
- [x] Proposal 审查与明确批准。完成证据：2026-09-22 用户明确要求推进 ONT.8。
- [x] 前置能力 readiness audit。完成证据：`openspec/changes/integrate-ontology-cross-package-adapters/evidence/readiness-audit.md`；P2.8、9.42、9.43 与 pi-tasks adapter 尚未全部 ready。
- [ ] 隔离 Task worktree 实施。
- [ ] E01–E16、架构回归与平台矩阵通过。

## 变更历史

| 日期 | 版本 | 变更 | 变更人 |
|---|---|---|---|
| 2026-09-19 | 0.1.0 | 创建 ONT.8 六份 Story 规格与独立 Proposal，明确跨包薄适配、前置门和真实恢复验收 | Codex |
