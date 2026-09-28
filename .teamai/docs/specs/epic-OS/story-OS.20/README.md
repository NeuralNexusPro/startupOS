# Story OS.20：窗体会话历史切换与上下文恢复

**Epic：** OS - Phase 0 OS 交互基础  
**状态：** Done
**优先级：** High  
**Owner：** Agent Runtime / Desktop UX  
**创建日期：** 2026-07-29  
**最后更新：** 2026-07-30

## User Story

作为在 Skill、Agent 或 RoleAgent 窗体中工作的用户，我希望点击任意历史会话后
立即切换到该会话，并恢复它的消息与 Agent 上下文，以便继续原来的任务，而不是
看到空白窗口或继续使用错误的会话状态。

## 问题摘要

当前所有窗体上的会话历史条目点击后无法形成有效切换：

- `AgentDialogContent` 只更新 `activeSessionId`，已初始化状态会阻止新 Session
  重新绑定。
- `SkillDialog` 虽会因 `activeSessionId` 变化再次调用初始化，但
  `usePiAgent.initialize()` 固定清空 renderer 消息。
- 已存在的 Session Create 路径可以返回历史 Session，却没有把历史消息和
  runtime context 恢复到当前 hook/Agent 实例。

## 简要验收标准

- [x] Skill、Agent、RoleAgent 窗体中的历史条目均可点击并切换。
- [x] 切换期间显示明确加载状态，禁止向旧 Session 发送新消息。
- [x] 成功后恢复所选 Session 的完整可见消息、project context、Agent 类型、
  CWD/outputDir、模型配置及可公开恢复的 runtime branch/context。
- [x] 切换后发送的下一条消息追加到所选历史 Session，并由恢复后的上下文处理。
- [x] 快速连续切换只接受最后一次请求，迟到响应不能覆盖当前 Session。
- [x] 历史 Session 缺失、损坏或恢复失败时保留当前会话并显示可见错误。
- [x] 新建会话、删除会话及普通实时流式消息行为不回归。

## 文档导航

- [需求](./requirements.md)
- [交互](./interaction.md)
- [架构](./architecture.md)
- [实施](./implementation.md)
- [测试](./testing.md)
- [返回 Epic OS](../README.md)

## 变更历史

| 日期 | 变更 |
|---|---|
| 2026-07-29 | 创建 Story，记录窗体历史点击失效与上下文恢复缺失问题 |
| 2026-07-29 | 完成 Proposal 实施与 90 项自动化验证，进入 Windows Electron 人工验收 |
| 2026-07-30 | 用户完成 Windows `desktop:dev` 人工验收，进入合并发布 |
| 2026-07-30 | Proposal 合并到 `dev`，完成合并后验证 |
