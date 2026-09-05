# Story OS.21：统一系统调度运行时与后台周期任务

**Epic：** OS — Phase 0 OS 交互基础  
**状态：** Planning  
**优先级：** High  
**Owner：** System Runtime  
**创建日期：** 2026-09-04  
**最后更新：** 2026-09-04

## User Story

作为 OriginOS 系统维护者，我希望用户定时任务和感知连接器等后台周期工作复用同一个 Scheduler Runtime，以便统一处理计时、重启恢复、并发防重、退避和运行日志，同时保持不同产品能力的数据与界面边界。

## 验收标准（简要）

- [ ] Core 提供与业务无关的统一调度运行时，Desktop 不再为邮箱轮询维护独立 `setInterval`。
- [ ] 调度项明确区分用户任务与隐藏的系统任务；系统任务不出现在普通定时任务列表中。
- [ ] 邮箱连接器启停、配置变化和应用退出会正确注册、重排或注销其系统任务。
- [ ] 同一调度点最多执行一次；不同邮箱彼此隔离，失败采用有界退避。
- [ ] 用户任务现有持久化、运行记录和权限边界保持兼容。
- [ ] 可观测数据能区分调度、业务执行与重试，不记录邮箱凭据或正文。

## 文档导航

- [需求](./requirements.md)
- [交互](./interaction.md)
- [架构](./architecture.md)
- [实施](./implementation.md)
- [测试](./testing.md)
- [Epic OS](../README.md)

## 关联 Story

- OS.16：系统级定时任务与定时唤起能力（用户任务产品层）
- SENSE.10：Email Connector Provisioning（首个系统周期任务消费者）
- SENSE.9：感知中心入口、配置与事件追溯

## 变更历史

| 日期 | 版本 | 说明 | 作者 |
|---|---|---|---|
| 2026-09-04 | 1.0 | 初始 Story，定义统一 Scheduler Runtime 边界 | System Runtime |
