# Design

## Context

P2.8 提供不可变发布契约，9.42 提供 `start()` contract-bound Run，Task Runtime 提供正式 Task 创建。缺少的是把三者按同一 requestId、template 和 semantic inputs 编排的应用服务。

## Goals / Non-Goals

**Goals:** 精确发布契约；写前完整语义门控；Task+Run 幂等绑定；中断可恢复；产品创建入口。

**Non-Goals:** 不设计任意工作流编辑器，不自动发布方案，不允许模型补全缺失契约字段。

## Decisions

### 创建请求只引用已发布对象

输入包含 projectId、solutionId、solutionVersion、contractId、taskTemplateId、objective、semanticInputs、requestId。服务通过 P2.8 store 精确读取并验证 hash/revocation，再校验 template candidate Agent/Skill 均在 frozen topology 中。

### 写前返回 DesignGap

required object slot、external FactType、Action permission、verifier/evidence policy 或 ontology revision 任一缺失时，返回与 P2.8 同结构 DesignGap。Task/Run/operation receipt 之外的业务写入均为零。

### 持久创建 operation 协调两套事实源

Core 在 `data/projects/{projectId}/task-creation/operations.jsonl` 持久化 intent/inputHash、task receipt、run receipt、completed。相同 requestId+hash 从最后阶段恢复；不同 hash 冲突。先创建 Task，再以返回的 taskId/revision 创建 Run；Run 失败时保留 operation 以恢复同一 Task，不创建第二个 Task。

### 薄 transport 与无乐观 UI

Desktop IPC 只装配服务；Web 表单读取已发布 contract/template 摘要并提交请求。成功后以返回 Task detail 刷新看板；失败显示 DesignGap，客户端不生成临时卡片。

## Risks / Trade-offs

- [Task 已创建但 Run 未响应] → operation 保留 task receipt，重放只恢复 Run。
- [契约在确认后撤销] → 每次未完成阶段恢复前重验 revocation/hash；已启动 Run 保留 frozen contract 并标记来源已撤销，不换 contract。
- [多窗口并发] → project-scoped mutation lock + requestId/inputHash CAS。

## Migration Plan

功能从新增入口启用；旧任务无需迁移。回滚入口不删除既有 Task、Run 或 operation receipt。
