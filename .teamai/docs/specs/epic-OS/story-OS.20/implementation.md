# 实施文档 - Story OS.20

**Story：** 窗体会话历史切换与上下文恢复  
**版本：** 1.0  
**最后更新：** 2026-07-29

## 实施前置

- [ ] 为本 Story 的实施 Task 创建 OpenSpec Proposal。
- [ ] Proposal 使用独立 Git branch/worktree；源码任务由隔离 subagent
  worktree 实施。
- [ ] 先实现 `testing.md` 中的 session fixtures 和并发 barrier。
- [ ] 确认选定 Pi Runtime 公开 reload/replay 边界，不访问私有 Session 格式。

## 实施步骤

### 1. 建立 restore contract

- [ ] 定义 request/result/error 和 `SessionSwitchState`。
- [ ] 明确 display messages 过滤规则及 ownership 校验。
- [ ] 从 Core 公共 `index.ts` 导出，不向 UI 暴露 runtime 私有对象。

### 2. Core Session 恢复

- [ ] 读取目标 StoredSession 并校验 project/entry ownership。
- [ ] 恢复或重绑 AgentManager 中的目标 Session runtime。
- [ ] 返回历史消息、project context、CWD、outputDir、Agent 类型、LLM config
  和公开 runtime 恢复结果。
- [ ] 对不存在、损坏、不兼容和不可恢复状态返回结构化错误。

### 3. IPC 与客户端 action

- [ ] 增加或扩展 Session restore IPC，不复用“create 后清空消息”的语义。
- [ ] `usePiAgent` 增加 `restoreSession()`。
- [ ] restore 使用 epoch/AbortController，原子提交完整快照。
- [ ] 切换前停止旧 stream、注销旧订阅，切换后按 Session ID 过滤事件。

### 4. 统一窗体接线

- [ ] `SkillDialog` 历史条目调用统一 restore action。
- [ ] `AgentDialogContent` 的 Agent/RoleAgent 历史条目调用同一 action。
- [ ] 修正 `isInitialized` 对 Session 变化的错误短路。
- [ ] 成功恢复时禁止自动 welcome；失败时保留原 Session。
- [ ] 删除按钮继续阻止冒泡，新建会话清理 restore 状态。

### 5. 可观测性与性能

- [ ] 记录 request epoch、脱敏 Session identity、restore phase、message count、
  elapsed time 和错误码。
- [ ] 不记录消息正文、system prompt、凭据或工具输出。
- [ ] 对长历史验证批量 state commit 和消息渲染性能。

### 6. 测试与验证

- [ ] 完成 Core 单元/集成、hook/component、IPC 和 Playwright 测试。
- [ ] 回归 Skill、Agent、RoleAgent、新建、删除、流式消息和窗体关闭重开。
- [ ] 创建自动化验证 Goal：“通过 Story OS.20 testing.md 中定义的测试 case”。

## 预计改动范围

- `packages/core/src/lib/integrations/pi-agent/`
- `packages/core/src/lib/integrations/pi-agent/hooks/`
- `packages/desktop/src/main/services/agent-session-service.ts`
- `packages/web/src/components/skills/SkillDialog.tsx`
- `packages/web/src/components/os/agent-dialog/AgentDialogContent.tsx`
- 相邻测试与 IPC protocol/service adapter

实施时以实际公共边界为准，不修改编译产物。

## 迁移与兼容

- 不迁移或重写现有历史 Session 文件。
- 历史记录字段缺失时以 warning 方式降级；ownership 无法确认时失败关闭。
- 现有新建/删除接口保持兼容。
- Web 非 Electron 环境必须通过同一 service contract 或返回明确 unsupported，
  不在组件内建立第二套恢复逻辑。

## 审查要点

- 是否真正恢复了 runtime context，而非只把消息塞回 UI。
- 是否仍有 `setActiveSessionId()` 后不调用 restore 的路径。
- 是否仍在 initialize existing Session 后无条件 `setMessages([])`。
- 是否旧 stream/迟到 restore 能覆盖新 Session。
- 是否跨 entry/project 读取了不属于当前窗体的会话。
- 是否恢复失败会清空当前可用消息。
- 是否 Skill、Agent、RoleAgent 出现三套分叉逻辑。

