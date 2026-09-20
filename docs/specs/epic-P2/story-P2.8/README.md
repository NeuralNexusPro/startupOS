# Story Spec: P2.8 - Workflow 设计与解决方案执行契约发布

**Epic:** P2 - AI 解决方案设计  
**Status:** In Progress（公共执行契约已冻结）
**Owner:** OriginOS Team  
**Created:** 2026-07-28  
**Last Updated:** 2026-07-28

## Story 概览

### User Story

作为解决方案设计者，
我希望在设计阶段完成 Workflow/Team、Agent、Skill、数据契约和验证策略的建模，并将确认版本发布为不可变执行契约，
以便运行时只能按已审阅的方案执行，而不能临场生成或修改 Workflow。

### 验收标准

- [ ] AC1: Workflow 只存在于解决方案设计阶段，运行时接口不提供 Workflow 创建、编辑或模式选择能力。
- [ ] AC2: 方案发布前校验拓扑、Agent/Skill 引用、I/O 契约、验证器、权限、预算和 HITL 策略。
- [ ] AC3: 只有已确认的方案版本可以生成带稳定 `contractHash` 的 `SolutionExecutionContract`。
- [ ] AC4: 已发布契约不可变；方案调整必须创建新版本和新契约。
- [ ] AC5: 发布失败返回结构化设计缺口，不产生可供运行时启动的半成品契约。
- [ ] AC6: 9.42 可通过公共读取端口消费契约，不直接依赖解决方案 UI 或内部存储实现。

## 范围

本 Story 负责设计态 Workflow 到运行时执行契约的编译、验证、发布和版本治理，不负责启动多 Agent、调度 WorkItem 或写入 `pi-tasks` evidence。

## 文档导航

- [需求文档](./requirements.md)
- [交互设计](./interaction.md)
- [架构设计](./architecture.md)
- [实施文档](./implementation.md)
- [测试文档](./testing.md)
- [返回 Epic P2](../README.md)

## 依赖

- Story P2.5：方案版本管理与执行清单
- Story P2.6：SOP I/O 契约
- Story P2.7：Workflow/Team 与 Agent-Skill 图谱
- Story 9.42：多 Agent 运行时消费本 Story 发布的执行契约

## 进度

- [x] Story 需求、交互、架构和测试用例定义
- [x] 公共契约类型、确定性编译与完整性校验实现
- [x] 发布门控纯函数实现
- [ ] 原子持久化与撤销记录实现
- [ ] UI 发布状态与错误反馈实现
- [ ] 自动化回归和验证 Goal

## 变更历史

| 日期       | 变更内容                                                  | 变更人 |
| ---------- | --------------------------------------------------------- | ------ |
| 2026-07-28 | 创建 Story，明确 Workflow 仅属于解决方案设计阶段          | Codex  |
| 2026-09-20 | 冻结公共执行契约、设计门控、hash 和读取端口，供 9.42 消费 | Codex  |

## 2026-09-14：项目语义执行规划补充

P28-T1将访谈确认的语义概念编译为执行上下文契约和任务模板，随方案版本冻结发布。仍为Planning。

完整依赖、状态所有权及验收场景见[主线规划](../../epic-ONT/project-semantic-execution-plan.md)。
