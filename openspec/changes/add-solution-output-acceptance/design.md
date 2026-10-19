# Design

## Context

见 [proposal.md](proposal.md)。现有 `SolutionExecutionContract` 已有 `VerificationPolicy`、`HitlPolicy` 和节点 `hitlPolicyId`，9.42 运行时也已支持 `after_verification` HITL。缺口集中在设计态的明确配置、持久化入口以及看板状态语义。

## Goals / Non-Goals

**Goals:**

- 用现有 HITL 契约表达节点级自动、用户和指定角色验收。
- 通过 Core 公共服务原子更新未发布方案 manifest，Web/Desktop 仅做参数与响应适配。
- 保持 verifier 在人工确认之前执行，并以 `completed` 作为下游唯一放行条件。
- 让看板状态与实际验证、HITL、修订和阻塞状态一致。

**Non-Goals:**

- 本 Story 不实现任意表达式条件确认；条件确认后续基于 canonical Rule 引用扩展。
- 不修改已发布契约，不为旧方案猜测人工验收策略。
- 不把用户确认替代 verifier。

## Decisions

### 1. 复用 `HitlPolicy`，不增加第二套验收事实源

自动验收表现为节点无 `after_verification` HITL；用户确认表现为 `approverRole: 'user'`；指定角色确认使用稳定角色 ID。节点通过 `hitlPolicyId` 精确引用策略。这样现有 9.42 运行时可直接消费。

替代方案是新增 `acceptancePolicies[]`。它会与 `hitl[]` 重叠并需要运行时双轨解释，因此不采用。

### 2. Core 服务拥有方案写入

新增 solution feature 公共服务，校验 project/version/node、方案状态和角色输入，原子更新 `manifest.json`。Web API 与 Electron IPC 只调用该服务，符合单向依赖规则。

### 3. 已发布或 confirmed 版本禁止原地修改

策略编辑只允许 draft/reviewing 版本。published/confirmed 版本提示创建新版本，避免 contractHash 与设计源漂移。

### 4. 看板不再合并 `blocked` 与 `reported`

旧 Supervisor `reported` 展示为“待 Supervisor 验收”；`blocked` 单独展示“受阻”。新 WorkItem 的 `verifying`、`waiting_hitl`、`revision` 使用独立标签；确认主体来自持久 HITL 请求。

## Risks / Trade-offs

- [旧 manifest 节点缺少显式验收字段] → 读取时按无 HITL 展示“自动验收”，只有用户保存才规范化写入。
- [角色 ID 对用户不友好] → UI 优先展示方案 Agent 中文名称，契约保存稳定 ID。
- [旧 Supervisor 仍依赖模型调用 verifier] → 本 Story先修正提示和看板语义；确定性自动调度以 contract-bound WorkItem 为正式执行线。
- [并发编辑 manifest] → 服务使用临时文件加 rename，保存前复核方案状态；已发布版本完全拒绝写入。

## Migration Plan

- 旧方案无须迁移，默认按自动验收展示。
- 新策略保存到未发布版本 manifest，发布后自然进入 contractHash。
- 回滚 UI 和写入入口不会损坏旧 manifest；新增 HITL 字段仍由现有解析器支持。

## 实施边界

- Core：solution 类型、策略读写服务、校验测试。
- Web/Desktop：适配入口与设计面板；不得复制文件写入规则。
- Collaboration：只调整投影标签与必要的 Supervisor 验收提示，不反向依赖 Web 或 solution 私有实现。
