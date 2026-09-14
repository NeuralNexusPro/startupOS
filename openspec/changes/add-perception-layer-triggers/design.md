## Context

外部平台在协议、验签、加密、ACK 时限、重试和事件标识上各不相同，但下游只应看到稳定的 PerceptionEvent。长耗时 Agent 执行必须与平台回调解耦；邮箱轮询也不能依赖短生命周期 API Route。

## Goals / Non-Goals

**Goals:** 统一事件模型、平台适配隔离、幂等安全路由、失败恢复、可审计。  
**Non-Goals:** 通用 iPaaS、任意脚本执行、替代 scheduler/neural-channel、绕过 Agent 权限。

## Decisions

### 1. Connector 与 Perception Runtime 分离

Connector 只负责平台协议、验签、解密、拉取和 ACK；Runtime 负责 normalize 之后的防御、去重、规则、授权、lease 和路由。平台代码不进入 Agent prompt 构造或业务 feature。

### 2. ACK-first asynchronous execution

Webhook 验证并持久化 inbox 后立即返回平台所需 ACK。后续归一化和 Agent 执行异步进行，以 lease 保证 at-least-once 输入下的 effectively-once trigger。

### 3. 显式目标授权

规则只能引用已存在且允许外部触发的 Project、RoleAgent 或 Skill。目标工具 scope、HITL 和 workspace 约束沿用现有运行时，外部事件不能扩大权限。

### 4. Skill ownership

Standalone Skill 只处理事件并输出产物，不拥有长期认知；Project/RoleAgent 内调用 Skill 时继承调用方 ownership，并携带 connector/rule/event provenance。

### 5. 文件存储与 Secret Reference

事件、规则、lease 和审计使用 DataFile/JSONL。凭据只保存 secret reference；真实 secret 由桌面安全存储或部署环境提供。

## Risks / Trade-offs

- 文件存储对高吞吐有限，MVP 通过有界队列、分片 JSONL 和背压满足个人用户规模。
- 平台能力差异会使 Connector capability 不完全一致，因此规则创建时必须校验目标事件是否受支持。
- 邮箱协议实现复杂，首版优先只读、游标增量和附件引用，不自动执行附件内容。

## Migration Plan

这是新增能力，无旧事件迁移。通过 capability flag 分 Connector 启用；任一 Connector 可独立停用，已有 Agent 主动会话和 scheduler 不受影响。

