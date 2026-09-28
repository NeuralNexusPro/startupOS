# Working Directory Context Architecture - Solution B Implementation

## 概述

本文档记录了工作目录上下文架构的重构，从方案 A（类型判断）迁移到方案 B（字段分离）。

## 问题背景

在原始实现中，存在以下问题：

1. **上下文传递不一致**：SkillDialog 通过 `projectContext.currentPath` 传递技能目录，但 agent-manager 期望 `agentBaseDir`
2. **类型判断逻辑分散**：需要在多处根据 `agentType` 判断使用 `skillBaseDir` 还是 `agentBaseDir`
3. **语义不清晰**：`agentBaseDir` 既用于 Agent/RoleAgent，又用于 Skill，容易混淆

## 解决方案对比

### 方案 A（原方案）
- 使用单一 `agentBaseDir` 字段
- 根据 `agentType` 在运行时判断设置 `skillBaseDir` 或 `agentBaseDir`
- 优点：改动小
- 缺点：语义不清晰，需要多处类型判断

### 方案 B（最终方案）✅
- 分离 `skillBaseDir` 和 `agentBaseDir` 字段
- 在 session 创建时就明确区分
- 优点：语义清晰，类型安全，易于维护
- 缺点：改动较多

## 实施细节

### 1. 类型定义修改

**文件**: `src/types/agent.ts`

```typescript
export interface AgentSession {
  // ... 其他字段
  agentBaseDir?: string;    // Agent/RoleAgent 的工作目录
  skillBaseDir?: string;    // Skill 的工作目录
}

export interface CreateSessionRequest {
  // ... 其他字段
  agentBaseDir?: string;    // Agent/RoleAgent 的工作目录
  skillBaseDir?: string;    // Skill 的工作目录
}
```

### 2. 数据流改造

#### SkillDialog → API
**文件**: `src/components/skills/SkillDialog.tsx`

```typescript
await initialize(
  currentStableSessionId,
  {
    projectId: `skill-${currentSkill}`,
    projectName: `技能: ${currentSkill}`,
  },
  {
    agentType: 'skill',
    systemPrompt,
    ...(skillBaseDir && { skillBaseDir }),  // ✅ 传递 skillBaseDir
  }
);
```

#### API Hook
**文件**: `src/lib/integrations/pi-agent/use-pi-agent-session.ts`

```typescript
body: JSON.stringify({
  // ... 其他字段
  ...(variables?.['skillBaseDir'] ? { skillBaseDir: variables?.['skillBaseDir'] } : {}),
  ...(variables?.['agentBaseDir'] ? { agentBaseDir: variables?.['agentBaseDir'] } : {}),
})
```

#### Session API
**文件**: `src/app/api/agent/sessions/route.ts`

```typescript
const createRequest = {
  // ... 其他字段
  agentBaseDir: body.agentBaseDir,
  skillBaseDir: body.skillBaseDir,
};
```

#### Session Service
**文件**: `src/lib/features/agent/session-service.ts`

```typescript
const session: AgentSession = {
  // ... 其他字段
  agentBaseDir: request.agentBaseDir,
  skillBaseDir: request.skillBaseDir,
};
```

### 3. Messages API 路由选择

**文件**: `src/app/api/agent/sessions/[sessionId]/messages/route.ts`

```typescript
// 根据 agentType 选择正确的目录字段
const agentBaseDir = session.agentType === 'skill'
  ? session.skillBaseDir
  : session.agentBaseDir;

const agent = await agentManager.getOrCreateAgent(
  sessionId,
  session.projectContext.projectId,
  {
    systemPrompt: session.systemPrompt || undefined,
    agentType: session.agentType,
    agentBaseDir,  // 传递统一的 agentBaseDir
  }
);
```

### 4. Agent Manager 简化

**文件**: `src/lib/integrations/pi-agent/agent-manager.ts`

```typescript
// ✅ 移除类型判断，统一设置 agentBaseDir
if (options?.agentBaseDir) {
  contextManager.setDefaultContext({
    ...existing,
    agentBaseDir: options.agentBaseDir,
  });
}
```

### 5. Bash Tool 简化

**文件**: `src/lib/integrations/pi-agent/tools/bash-tools.ts`

```typescript
// ✅ 简化优先级链：agentBaseDir > contextPath > params > process.cwd()
async function resolveWorkingDirectory(
  paramsWorkingDirectory?: string,
): Promise<string> {
  const toolContext = getToolContext();
  const agentBaseDir = toolContext.agentBaseDir;  // 统一使用 agentBaseDir
  const contextPath = toolContext.projectContext?.currentPath;

  let cwd: string;
  if (agentBaseDir) {
    cwd = agentBaseDir;
  } else if (contextPath) {
    cwd = contextPath;
  } else if (paramsWorkingDirectory) {
    // ... 处理参数
  } else {
    cwd = process.cwd();
  }
  // ...
}
```

### 6. Skill Tool 清理

**文件**: `src/lib/integrations/pi-agent/tools/skill-tools.ts`

```typescript
// ✅ 移除 skillBaseDir 设置逻辑
// 不再需要在 Skill 元工具中设置上下文
// 由 messages API 统一处理
```

## 工作目录优先级

最终的工作目录解析优先级：

```
agentBaseDir > projectContext.currentPath > params > process.cwd()
```

- **agentBaseDir**: 由 session 创建时设置（Skill 使用 `skillBaseDir`，Agent 使用 `agentBaseDir`）
- **projectContext.currentPath**: 项目上下文路径
- **params**: LLM 传入的 `workingDirectory` 参数
- **process.cwd()**: 进程工作目录（最后回退）

## 测试验证

**文件**: `src/__tests__/integration/tool-context-priority.test.ts`

所有 5 个测试通过：
- ✅ 无上下文时使用 process.cwd()
- ✅ 使用 projectContext.currentPath
- ✅ agentBaseDir 优先于 projectContext
- ✅ 实际目录执行
- ✅ agentBaseDir 存在性检查

## 优势总结

1. **语义清晰**：`skillBaseDir` 和 `agentBaseDir` 明确区分用途
2. **类型安全**：TypeScript 类型定义更准确
3. **易于维护**：减少运行时类型判断，逻辑更简单
4. **可扩展性**：未来添加新类型（如 `projectBaseDir`）更容易
5. **统一接口**：agent-manager 只需处理 `agentBaseDir`，由上层路由选择

## 迁移影响

### 已修改文件
1. `src/types/agent.ts` - 类型定义
2. `src/components/skills/SkillDialog.tsx` - 传递 skillBaseDir
3. `src/lib/integrations/pi-agent/use-pi-agent-session.ts` - API 请求
4. `src/app/api/agent/sessions/route.ts` - 接收参数
5. `src/lib/features/agent/session-service.ts` - 存储字段
6. `src/app/api/agent/sessions/[sessionId]/messages/route.ts` - 路由选择
7. `src/lib/integrations/pi-agent/agent-manager.ts` - 简化逻辑
8. `src/lib/integrations/pi-agent/tools/bash-tools.ts` - 简化解析
9. `src/lib/integrations/pi-agent/tools/skill-tools.ts` - 移除上下文设置
10. `src/__tests__/integration/tool-context-priority.test.ts` - 更新测试

### 向后兼容性
- 旧的 session 数据仍可读取（`agentBaseDir` 字段保留）
- 新的 session 会同时存储 `skillBaseDir` 和 `agentBaseDir`

## 后续工作

1. 清理调试日志（可选）
2. 更新相关文档
3. 监控生产环境运行情况

## 参考

- 原始问题讨论：Session context undefined issue
- 方案对比：Solution A vs Solution B
- 测试结果：All 5 tests passed
