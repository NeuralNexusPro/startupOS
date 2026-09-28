# 架构 - Story R.6

**Story:** 重构 RoleAgent Launcher
**Epic:** R - RoleAgent pi-agent 循环重构
**最后更新:** 2026-04-27

---

## 🏗️ 技术实现

**修改文件：** `src/lib/services/launcher/role-agent.ts`

### 变更内容

```typescript
// 现有流程（保留）
const systemPrompt = await this.buildAgentSystemPrompt(agent, session);

// 新增流程（RoleAgent 专属）
const roleContext = await loadRoleContext(agent.baseDir);
if (roleContext) {
  const stateMachine = parseStateMachine(roleContext.roleMd);
  const rolePrompt = buildRoleSystemPrompt(roleContext, stateMachine);

  // 拼接原有 system prompt 和 RoleAgent 专属 prompt
  const finalPrompt = `${systemPrompt}\n\n${rolePrompt}`;

  // 初始化 MemoryTracker
  const memoryTracker = new MemoryTracker(agent.baseDir);

  // 注册 turn_end 钩子
  agent.on('turn_end', async (event) => {
    // 1. 状态机检查
    const transition = checkTransition(stateMachine, event.messages);
    if (transition) {
      await updateRoleMdPhase(agent.baseDir, transition);
    }

    // 2. 记忆追踪
    memoryTracker.recordTurn(event.userMessage, event.turnNumber);
    if (memoryTracker.shouldFlush()) {
      const existingMemory = await readMemoryMd(agent.baseDir);
      await memoryTracker.flushMemory(existingMemory);
    }
  });
}
```

### 依赖

- `./role-agent/role-context`（R.1）
- `./role-agent/state-machine`（R.2）
- `./role-agent/system-prompt`（R.4）
- `./role-agent/memory-tracker`（R.5）
- `./base.ts` 的 `buildAgentSystemPrompt`（现有）

### 集成点

- `turn_start` / `think` / `tool_call` / `message_end` / `turn_end` 生命周期钩子
- OriginOSAgent 的 `on()` 事件监听

---

## 🔗 相关文档

- [Epic R README](../README.md)
- [设计方案](../../../../.claude/plans/roleagent-pi-agent-loop.md#376-重构-roleagent-launcher)
